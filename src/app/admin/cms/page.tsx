'use client';

import { useState } from 'react';
import { AlertCircle, FileText, Globe, Layout, Loader2 } from 'lucide-react';
import HistorialVersionesModal from '@/components/cms/HistorialVersionesModal';
import { CmsProvider } from './_context';
import { useCmsSecciones } from './_hooks/useCmsSecciones';
import { LandingEditor } from './_components/editors/LandingEditor';
import { PaginasEditor } from './_components/editors/PaginasEditor';
import { SeoEditor } from './_components/editors/SeoEditor';
import { SECTION_LABELS, type TabId } from './_types';

// Editor CMS de la landing pública.
// Refactorizado en componentes modulares bajo ./_components/editors/*.
// La lógica de estado/fetch/save vive en ./_hooks/useCmsSecciones.
// El estado se comparte vía Context (./_context.tsx) para evitar
// prop-drilling a los sub-editores.
export default function CMSPage() {
  const cms = useCmsSecciones();
  const [activeTab, setActiveTab] = useState<TabId>('landing');

  if (cms.loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'landing', label: 'Landing', icon: <Layout className="w-4 h-4" /> },
    { id: 'seo', label: 'SEO / Schema', icon: <Globe className="w-4 h-4" /> },
    { id: 'paginas', label: 'Páginas', icon: <FileText className="w-4 h-4" /> },
  ];

  return (
    <CmsProvider value={cms}>
      <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="text-2xl font-bold text-foreground">CMS Landing</h1>
          <p className="text-sm text-muted mt-1">
            Administra el contenido del sitio público de Imprima
          </p>
        </div>

        {cms.error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" /> {cms.error}
            <button
              onClick={() => cms.setError(null)}
              className="ml-auto text-red-500 font-bold text-xs"
            >
              Cerrar
            </button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-1 bg-white rounded-xl border border-border p-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.id ? 'bg-primary/10 text-primary' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'landing' && <LandingEditor />}
        {activeTab === 'seo' && <SeoEditor />}
        {activeTab === 'paginas' && <PaginasEditor />}

        {cms.historialSeccion && (
          <HistorialVersionesModal
            seccionId={cms.historialSeccion}
            seccionLabel={SECTION_LABELS[cms.historialSeccion] ?? cms.historialSeccion}
            onClose={() => cms.setHistorialSeccion(null)}
            onRestored={() => {
              void cms.fetchSecciones();
            }}
          />
        )}
      </div>
    </CmsProvider>
  );
}
