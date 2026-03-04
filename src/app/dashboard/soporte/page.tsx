'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import { formatDateTime } from '@/lib/utils';
import { Headphones, Loader2, Mail, MessageCircle, PhoneCall } from 'lucide-react';

interface PedidoSoporte {
  id: string;
  numero: string;
  estado: string;
  fecha_creacion: string;
}

export default function SoportePage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [pedidosRecientes, setPedidosRecientes] = useState<PedidoSoporte[]>([]);
  const supabase = createClient();

  useEffect(() => {
    const fetchPedidosRecientes = async () => {
      if (!user) return;

      setLoading(true);

      let query = supabase
        .from('pedidos')
        .select('id, numero, estado, fecha_creacion')
        .order('fecha_creacion', { ascending: false })
        .limit(8);

      if (user.rol === 'comprador') {
        query = query.eq('usuario_creador_id', user.id);
      } else if (user.empresa_id) {
        query = query.eq('empresa_id', user.empresa_id);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error cargando pedidos para soporte:', error);
        setPedidosRecientes([]);
      } else {
        setPedidosRecientes((data as PedidoSoporte[]) || []);
      }

      setLoading(false);
    };

    fetchPedidosRecientes();
  }, [supabase, user]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Soporte</h1>
        <p className="text-muted text-sm mt-1">Canales de atención y contexto de pedidos para escalar incidentes</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <a
          href="mailto:soporte@imprima.com.co?subject=Soporte%20Portal%20B2B"
          className="rounded-xl border border-border bg-white p-4 hover:border-primary/40 transition-colors"
        >
          <Mail className="w-5 h-5 text-primary" />
          <h2 className="mt-2 text-sm font-semibold text-foreground">Correo</h2>
          <p className="text-xs text-muted mt-1">soporte@imprima.com.co</p>
        </a>

        <a
          href="tel:+576011234567"
          className="rounded-xl border border-border bg-white p-4 hover:border-primary/40 transition-colors"
        >
          <PhoneCall className="w-5 h-5 text-primary" />
          <h2 className="mt-2 text-sm font-semibold text-foreground">Línea directa</h2>
          <p className="text-xs text-muted mt-1">(+57) 601 123 4567 · L-V 8:00 a.m - 6:00 p.m.</p>
        </a>

        <a
          href="https://wa.me/573001112233"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-xl border border-border bg-white p-4 hover:border-primary/40 transition-colors"
        >
          <MessageCircle className="w-5 h-5 text-primary" />
          <h2 className="mt-2 text-sm font-semibold text-foreground">WhatsApp</h2>
          <p className="text-xs text-muted mt-1">Canal rápido para incidencias operativas</p>
        </a>
      </div>

      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="font-semibold text-foreground">Pedidos recientes para referencia en soporte</h2>
          <Link href="/dashboard/pedidos" className="text-sm font-medium text-primary hover:text-primary-dark">
            Ver pedidos
          </Link>
        </div>

        {loading ? (
          <div className="p-8 text-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" />
          </div>
        ) : pedidosRecientes.length === 0 ? (
          <div className="p-10 text-center">
            <Headphones className="w-10 h-10 text-border mx-auto mb-3" />
            <h3 className="text-base font-semibold text-foreground">Sin pedidos recientes</h3>
            <p className="text-sm text-muted mt-1">Cuando tengas actividad de pedidos, aparecerá aquí como contexto para soporte.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-background-light/50">
                  <th className="text-left py-3 px-4 font-medium text-muted">Pedido</th>
                  <th className="text-left py-3 px-4 font-medium text-muted">Estado</th>
                  <th className="text-left py-3 px-4 font-medium text-muted">Fecha creación</th>
                </tr>
              </thead>
              <tbody>
                {pedidosRecientes.map((pedido) => (
                  <tr key={pedido.id} className="border-b border-border/50 hover:bg-background-light/30">
                    <td className="py-3 px-4">
                      <Link href={`/dashboard/pedidos/${pedido.id}`} className="font-semibold text-foreground hover:text-primary">
                        {pedido.numero}
                      </Link>
                    </td>
                    <td className="py-3 px-4 text-muted">{pedido.estado}</td>
                    <td className="py-3 px-4 text-muted">{formatDateTime(pedido.fecha_creacion)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
