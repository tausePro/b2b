export const PLATFORM_BONUS_PERCENT = 0.5;
export const PLATFORM_BONUS_START_DATE = '2026-09-01';

export type CommissionPeriodStatus = 'provisional' | 'cerrado' | 'pagado';
export type CommissionDocumentType = 'out_invoice' | 'out_refund';

export interface CommissionPeriodRange {
  period: string;
  periodDate: string;
  startDate: string;
  endDate: string;
}

export interface EligiblePlatformClient {
  id: string;
  name: string;
  bonusStartDate: string;
}

export interface PlatformBonusDetail {
  companyId: string;
  companyName: string;
  invoiceId: number;
  invoiceName: string | null;
  invoiceDate: string;
  documentType: CommissionDocumentType;
  currency: string;
  netBase: number;
  bonus: number;
  orderIds: string[];
  saleOrderIds: number[];
  invoiceLineIds: number[];
}

export interface PlatformBonusClientSummary extends EligiblePlatformClient {
  invoiceCount: number;
  creditNoteCount: number;
  invoicedBase: number;
  creditNotes: number;
  netBase: number;
  bonus: number;
}

export interface PlatformBonusTotals {
  activeClients: number;
  invoiceCount: number;
  creditNoteCount: number;
  invoicedBase: number;
  creditNotes: number;
  netBase: number;
  bonus: number;
}

export function roundCurrency(value: number): number {
  if (!Number.isFinite(value)) throw new Error('Importe no válido para liquidación.');
  const rounded = Number(Math.abs(value).toFixed(8));
  const cents = Math.round((rounded + Number.EPSILON * Math.max(1, rounded)) * 100);
  return cents === 0 ? 0 : Math.sign(value) * cents / 100;
}

export function calculatePlatformBonus(netBase: number, percentage = PLATFORM_BONUS_PERCENT): number {
  if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
    throw new Error('Porcentaje no válido para liquidación.');
  }
  return roundCurrency(netBase * (percentage / 100));
}

export function getInvoiceLineBase(balance: unknown): number {
  if (typeof balance !== 'number' || !Number.isFinite(balance)) {
    throw new Error('La línea Odoo no contiene un saldo contable válido.');
  }
  return roundCurrency(-balance);
}

export function getBogotaCalendarDate(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get('year')}-${values.get('month')}-${values.get('day')}`;
}

export function getCommissionPeriodRange(period: string): CommissionPeriodRange {
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (!match) throw new Error('El periodo debe tener formato AAAA-MM.');

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (year < 2020 || year > 2100 || month < 1 || month > 12) {
    throw new Error('El periodo indicado no es válido.');
  }

  const endDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const monthValue = String(month).padStart(2, '0');
  const startDate = `${year}-${monthValue}-01`;
  if (startDate < PLATFORM_BONUS_START_DATE) {
    throw new Error(`El bono plataforma no tiene vigencia antes del ${PLATFORM_BONUS_START_DATE}.`);
  }

  return {
    period,
    periodDate: startDate,
    startDate,
    endDate: `${year}-${monthValue}-${String(endDay).padStart(2, '0')}`,
  };
}

export function summarizePlatformBonus(
  clients: EligiblePlatformClient[],
  details: PlatformBonusDetail[],
): { clients: PlatformBonusClientSummary[]; totals: PlatformBonusTotals } {
  const detailByCompany = new Map<string, PlatformBonusDetail[]>();
  const documentKeys = new Set<string>();
  const companyIds = new Set(clients.map((client) => client.id));
  if (companyIds.size !== clients.length) throw new Error('Cliente duplicado en la liquidación.');
  for (const detail of details) {
    const key = `${detail.companyId}:${detail.invoiceId}`;
    if (documentKeys.has(key) || !companyIds.has(detail.companyId) || detail.currency !== 'COP') {
      throw new Error('Documento duplicado, sin cliente elegible o con moneda incompatible.');
    }
    documentKeys.add(key);
    const current = detailByCompany.get(detail.companyId) ?? [];
    current.push(detail);
    detailByCompany.set(detail.companyId, current);
  }

  const clientSummaries = clients
    .map((client) => {
      const clientDetails = detailByCompany.get(client.id) ?? [];
      const invoicedBase = roundCurrency(
        clientDetails
          .filter((detail) => detail.documentType === 'out_invoice')
          .reduce((sum, detail) => sum + detail.netBase, 0),
      );
      const creditNotes = roundCurrency(
        clientDetails
          .filter((detail) => detail.documentType === 'out_refund')
          .reduce((sum, detail) => sum - detail.netBase, 0),
      );
      const netBase = Math.max(0, roundCurrency(invoicedBase - creditNotes));

      return {
        ...client,
        invoiceCount: clientDetails.filter((detail) => detail.documentType === 'out_invoice').length,
        creditNoteCount: clientDetails.filter((detail) => detail.documentType === 'out_refund').length,
        invoicedBase,
        creditNotes,
        netBase,
        bonus: calculatePlatformBonus(netBase),
      };
    })
    .sort((left, right) => right.bonus - left.bonus || left.name.localeCompare(right.name, 'es'));

  return {
    clients: clientSummaries,
    totals: {
      activeClients: clientSummaries.length,
      invoiceCount: clientSummaries.reduce((sum, client) => sum + client.invoiceCount, 0),
      creditNoteCount: clientSummaries.reduce((sum, client) => sum + client.creditNoteCount, 0),
      invoicedBase: roundCurrency(clientSummaries.reduce((sum, client) => sum + client.invoicedBase, 0)),
      creditNotes: roundCurrency(clientSummaries.reduce((sum, client) => sum + client.creditNotes, 0)),
      netBase: roundCurrency(clientSummaries.reduce((sum, client) => sum + client.netBase, 0)),
      bonus: roundCurrency(clientSummaries.reduce((sum, client) => sum + client.bonus, 0)),
    },
  };
}
