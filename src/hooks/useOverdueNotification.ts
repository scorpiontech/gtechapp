import { useEffect, useRef } from 'react';
import { MikWebCliente } from '@/types/mikweb';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook that checks for overdue bills when the app opens and shows
 * a local notification if there are any.
 */
export function useOverdueNotification(cliente: MikWebCliente | null) {
  const hasChecked = useRef(false);

  useEffect(() => {
    if (!cliente || hasChecked.current) return;
    hasChecked.current = true;

    const checkOverdue = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('mikweb-boletos', {
          body: { cliente_id: cliente.id },
        });

        if (error || !data?.success) return;

        const boletos = data.boletos || [];
        const overdue = boletos.filter((b: any) => b.status === 'vencido');

        if (overdue.length === 0) return;

        const totalOverdue = overdue.reduce((sum: number, b: any) => sum + (b.valor || 0), 0);

        // Try browser Notification API
        if ('Notification' in window) {
          if (Notification.permission === 'granted') {
            showLocalNotification(overdue.length, totalOverdue);
          } else if (Notification.permission !== 'denied') {
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
              showLocalNotification(overdue.length, totalOverdue);
            }
          }
        }
      } catch {
        // Silent - don't break app if notification check fails
      }
    };

    checkOverdue();
  }, [cliente]);
}

function showLocalNotification(count: number, total: number) {
  const formattedTotal = total.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });

  const title = 'GTech - Mensalidade em atraso';
  const body =
    count === 1
      ? `Você possui 1 boleto vencido no valor de ${formattedTotal}. Regularize para evitar bloqueio.`
      : `Você possui ${count} boletos vencidos totalizando ${formattedTotal}. Regularize para evitar bloqueio.`;

  new Notification(title, {
    body,
    icon: '/pwa-192x192.png',
    tag: 'overdue-bills',
  } as NotificationOptions);
}
