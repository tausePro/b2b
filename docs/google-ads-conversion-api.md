# Google Ads Conversion API — Plan de implementación

> Estado: **pausado / pendiente de credenciales**
> Releases relacionados: v1.26.0 (base de atribución ✅) → v1.27.0 (Conversion API) → v1.28.0 (GA4 server-side)
> Rama sugerida: `feature/google-ads-conversion-api`

---

## Contexto de negocio

En v1.26.0 capturamos `gclid` y parámetros `utm_*` de cada visitante y los
persistimos por lead en la tabla `public.leads`. Eso permite ver en
`/admin/leads` qué leads vinieron de pauta, pero **Google Ads todavía no
sabe** que esos leads ocurrieron, así que sus algoritmos de optimización
(Smart Bidding, Maximize Conversions, tCPA) no tienen señal real y
"adivinan" basándose solo en clics o en el click-level tracking del sitio.

El objetivo de v1.27.0 es **cerrar el ciclo**: cada vez que se crea un
lead con `gclid`, el servidor sube una *ClickConversion* a la
Google Ads API vía endpoint `customers/{customer_id}:uploadClickConversions`.
Esto hace que Google Ads:

1. Cuente la conversión en la campaña/keyword/anuncio que originó el clic.
2. Alimente sus modelos de Smart Bidding con conversiones verificadas
   server-side (menos fraude, menos pérdida por ad-blockers).
3. Active la optimización automática hacia audiencias similares.

---

## Elección: OAuth 2.0 con refresh_token

Se descartan Service Account / Domain-Wide Delegation porque:

- DWD requiere Google Workspace configurado en el dominio.
- OAuth es el flujo canónico para apps externas que suben datos a una
  cuenta de Google Ads.
- Refresh tokens de Google Ads **no expiran** mientras no sean revocados
  manualmente o la cuenta pase 6 meses sin uso, así que no hay fricción
  recurrente.

---

## Credenciales que se necesitan (y cómo obtenerlas)

### 1. `GOOGLE_ADS_DEVELOPER_TOKEN`

- En [Google Ads API Center](https://ads.google.com/aw/apicenter).
- La cuenta **debe ser una cuenta Manager (MCC)**. Si Imprima no tiene
  MCC, hay que crear una MCC y vincularla como administrador de la
  cuenta actual.
- Token inicial llega en modo **Test**: solo funciona contra cuentas
  de test o contra la propia cuenta vinculada al MCC. Para producción
  hay que pedir **Basic Access** (formulario ~1 semana de aprobación).
- **Acción**: obtener token, solicitar Basic Access en paralelo; mientras
  llega, podemos testear contra la cuenta real del cliente porque está
  bajo el MCC.

### 2. `GOOGLE_ADS_CUSTOMER_ID`

- ID de 10 dígitos de la cuenta de Google Ads donde corren las campañas
  (formato `XXX-XXX-XXXX` → al usarlo quitamos los guiones).
- Lo ve cualquier admin de la cuenta en la esquina superior derecha.

### 3. `GOOGLE_ADS_LOGIN_CUSTOMER_ID` (opcional)

- Solo si la cuenta usada para autenticar (MCC) es distinta a
  `GOOGLE_ADS_CUSTOMER_ID`. Es el ID del MCC que administra la cuenta
  hija. Se envía como header `login-customer-id`.

### 4. `GOOGLE_ADS_CONVERSION_ACTION_ID`

- En Google Ads → **Tools & Settings → Measurement → Conversions**.
- Crear una nueva conversión tipo **"Import → Other data sources or
  CRMs → Track conversions from clicks"**.
- Anotar el **Conversion Action ID** (solo dígitos, ~10 chars).
- Configurar:
  - **Category**: Lead
  - **Value**: Don't use a value *(o valor fijo si decidimos estimarlo)*
  - **Count**: One *(un lead = una conversión)*
  - **Click-through conversion window**: 90 días *(coincide con la
    cookie `lead_attr`)*
  - **Attribution model**: Data-driven *(si hay volumen, si no, Last click)*

### 5. OAuth client

- En [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials.
- Crear un **OAuth 2.0 Client ID** tipo **Web application**.
- Authorized redirect URIs: `https://developers.google.com/oauthplayground`
  (para generar el refresh token una sola vez).
- Anotar `client_id` y `client_secret`.

### 6. Refresh token

- Ir a [OAuth Playground](https://developers.google.com/oauthplayground).
- ⚙️ Settings → marcar "Use your own OAuth credentials" → pegar client_id y client_secret.
- En la lista de scopes, elegir `https://www.googleapis.com/auth/adwords`.
- Authorize → login con la cuenta Google que administra la cuenta de Ads → aceptar permisos.
- Exchange authorization code for tokens → copiar el **refresh_token**.
- Este token **no caduca** salvo revocación manual.

### Resumen de `.env.local` a configurar

```bash
# Google Ads Conversion API (v1.27.0)
GOOGLE_ADS_DEVELOPER_TOKEN=
GOOGLE_ADS_CUSTOMER_ID=          # sin guiones, 10 dígitos
GOOGLE_ADS_LOGIN_CUSTOMER_ID=    # opcional, MCC ID
GOOGLE_ADS_CONVERSION_ACTION_ID= # solo dígitos
GOOGLE_ADS_OAUTH_CLIENT_ID=
GOOGLE_ADS_OAUTH_CLIENT_SECRET=
GOOGLE_ADS_OAUTH_REFRESH_TOKEN=
```

Todas server-only (sin prefijo `NEXT_PUBLIC_`). Nunca exponer al
cliente: bastan el developer_token y el refresh_token para que alguien
suba conversiones fraudulentas y distorsione el pipeline.

---

## Plan de implementación v1.27.0

### Tabla `leads_conversiones_enviadas` (migración 037)

Trazabilidad de cada intento de upload. Permite:
- Ver qué leads ya fueron reportados (evita dobles conteos).
- Debuggear fallos de la API (partial_failure_error, invalid_customer_id, etc.).
- Reintentar manualmente desde admin.

Columnas:

```sql
CREATE TABLE public.leads_conversiones_enviadas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  proveedor TEXT NOT NULL,              -- 'google_ads' | 'ga4'
  estado TEXT NOT NULL,                 -- 'pendiente' | 'enviado' | 'fallido' | 'descartado'
  intentos INTEGER NOT NULL DEFAULT 0,
  respuesta JSONB,                      -- payload de respuesta de la API
  error_mensaje TEXT,
  conversion_action_id TEXT,
  gclid TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  enviado_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX idx_conversiones_lead_proveedor
  ON public.leads_conversiones_enviadas(lead_id, proveedor);
```

### Helper `src/lib/ads/googleAdsConversion.ts`

Funciones:

```ts
// 1. Intercambia refresh_token por access_token (cache en memoria ~50min).
async function getAccessToken(): Promise<string>

// 2. Sube una ClickConversion. Usa fetch nativo (el SDK oficial pesa 8MB).
async function uploadClickConversion(params: {
  gclid: string;
  conversionDateTime: string; // "YYYY-MM-DD HH:mm:ss+00:00"
  conversionValue?: number;
  currencyCode?: string;      // default 'COP'
  orderId: string;            // leads.id (evita duplicados)
}): Promise<UploadResult>

// 3. Flujo end-to-end: valida lead, inserta fila en
//    leads_conversiones_enviadas, llama a uploadClickConversion,
//    actualiza estado y respuesta.
async function reportLeadConversionToGoogleAds(leadId: string): Promise<void>
```

Nota crítica: `conversionDateTime >= click_date_time`. Usar
`leads.created_at` como conversion_date_time garantiza la condición
porque siempre es posterior a `leads.click_at`.

### Disparo desde `/api/leads`

Después del `insert` del lead:

```ts
// Fire-and-forget: no bloqueamos la respuesta al usuario. Si falla, queda
// registrado en leads_conversiones_enviadas con estado='fallido' para
// reintento manual.
if (data.gclid) {
  void reportLeadConversionToGoogleAds(data.id).catch((e) =>
    console.error('[google-ads] upload fallido', data.id, e)
  );
}
```

**Importante**: `void` + `.catch()` para no dejar promesas colgando en
runtime serverless. Si queremos reintentos automáticos, agregar un cron
de Vercel que corra cada hora buscando `estado='fallido'` y `intentos<3`.

### Admin `/admin/leads/conversiones`

Nueva página o sección en `/admin/leads` con tabla:

| Lead | Proveedor | Estado | Intentos | Último error | Acciones |
|---|---|---|---|---|---|
| Nombre | google_ads | ✅ enviado | 1 | — | Ver respuesta |
| Nombre | google_ads | ❌ fallido | 3 | "Invalid gclid" | Reintentar / descartar |

### Variables de entorno — fallback

Si las 7 variables no están todas presentes, el helper **no lanza error**:
solo inserta `estado='descartado'` con `error_mensaje='credenciales ausentes'`.
Así el deploy nunca rompe por variables sin configurar.

---

## Testing

### Cuenta de test

Google Ads provee una cuenta de test vinculable a cualquier MCC. El
developer_token en modo Test solo puede subir conversiones ahí.

### Flujo de prueba manual

1. Ir a `https://imprima.co/?gclid=EAIaIQobChMI_PRUEBA&utm_source=google&utm_campaign=test-v1.27`
2. Verificar cookie `lead_attr`.
3. Enviar un lead de prueba.
4. En BD: fila en `leads_conversiones_enviadas` con `estado='enviado'`.
5. En Google Ads → Conversions → acción "Lead" → ver la conversión (tarda ~3h en reflejarse).

### gclid real vs fake

Para test E2E contra cuenta real hay que usar un gclid real (que viene
de un clic real en un anuncio). En test con developer_token de prueba
Google acepta cualquier string de 40 chars.

---

## Riesgos / consideraciones

- **Ventana de 90 días**: si Imprima va a comprar en promedio 30 días
  después del primer contacto (típico en B2B largo), la ventana de
  atribución debe ser >=90 para no perder conversiones.
- **Sin valor monetario**: si tenemos un valor estimado del lead (ej.
  ticket medio × tasa de conversión), podemos enriquecer la señal.
  Decisión pendiente: configurar valor en Google Ads UI o enviarlo por
  API.
- **PII hashing (enhanced conversions)**: para mejorar match rate se
  puede enviar email y teléfono hasheados SHA-256. Considerar en v1.29
  si la tasa de matching es baja.
- **Rate limits**: la API acepta hasta 2000 conversiones por request.
  Para el volumen de Imprima (< 100 leads/día) no es relevante.

---

## Tareas concretas cuando retomemos

- [ ] Obtener las 7 variables de `.env.local`.
- [ ] Aplicar migración 037 en producción.
- [ ] Implementar `src/lib/ads/googleAdsConversion.ts`.
- [ ] Integrar disparo en `/api/leads/route.ts`.
- [ ] Panel admin de conversiones.
- [ ] Smoke test contra cuenta real en modo Basic Access.
- [ ] Documentar runbook de reintento manual.

---

## v1.28.0 — GA4 server-side (Measurement Protocol)

Post-v1.27. Envía evento `generate_lead` a GA4 con `gclid` adjunto para
que GA4 → Google Ads vincule la conversión (vía "GA4 conversion import").

Variables:

```bash
GA4_MEASUREMENT_ID=G-XXXXXXXX
GA4_API_SECRET=                 # Admin → Data Streams → Measurement Protocol
```

Helper análogo en `src/lib/analytics/ga4Server.ts`. Mismo patrón de
trazabilidad en `leads_conversiones_enviadas` con `proveedor='ga4'`.

Por qué este segundo canal:
- GA4 no requiere developer_token ni OAuth (solo API secret).
- Es la fuente canónica de reportes para marketing.
- Redundancia: si falla el upload a Google Ads, al menos GA4 tiene el evento.
