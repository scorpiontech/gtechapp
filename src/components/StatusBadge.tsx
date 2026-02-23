import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type StatusType = 'ativo' | 'bloqueado' | 'pendente' | 'pago' | 'vencido' | 'aberto' | 'access_active' | 'access_blocked' | 'access_pending' | 'active' | 'canceled' | 'paused';

interface StatusBadgeProps {
  status: string;
  className?: string;
}

const statusConfig: Record<StatusType, { label: string; className: string }> = {
  ativo: { label: 'Ativo', className: 'bg-success text-success-foreground' },
  bloqueado: { label: 'Bloqueado', className: 'bg-destructive text-destructive-foreground' },
  pendente: { label: 'Pendente', className: 'bg-warning text-warning-foreground' },
  pago: { label: 'Pago', className: 'bg-success text-success-foreground' },
  vencido: { label: 'Vencido', className: 'bg-destructive text-destructive-foreground' },
  aberto: { label: 'Aberto', className: 'bg-primary text-primary-foreground' },
  access_active: { label: 'Ativo', className: 'bg-success text-success-foreground' },
  access_blocked: { label: 'Bloqueado', className: 'bg-destructive text-destructive-foreground' },
  access_pending: { label: 'Pendente', className: 'bg-warning text-warning-foreground' },
  active: { label: 'Ativo', className: 'bg-success text-success-foreground' },
  canceled: { label: 'Cancelado', className: 'bg-muted text-muted-foreground' },
  paused: { label: 'Pausado', className: 'bg-warning text-warning-foreground' },
};

export const StatusBadge = React.forwardRef<HTMLDivElement, StatusBadgeProps>(
  ({ status, className }, ref) => {
    const normalizedStatus = String(status || '').toLowerCase() as StatusType;
    const config = statusConfig[normalizedStatus] || {
      label: status,
      className: 'bg-muted text-muted-foreground',
    };

    return (
      <Badge ref={ref} className={cn(config.className, className)}>
        {config.label}
      </Badge>
    );
  },
);

StatusBadge.displayName = 'StatusBadge';
