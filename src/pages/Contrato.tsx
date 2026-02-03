import React from 'react';
import { Wifi, MapPin, User, Phone, Mail, Calendar, CreditCard } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { AppLayout } from '@/components/AppLayout';
import { StatusBadge } from '@/components/StatusBadge';
import { useAuth } from '@/contexts/AuthContext';

const Contrato: React.FC = () => {
  const { cliente } = useAuth();

  if (!cliente) {
    return null;
  }

  const formatCPF = (cpf: string) => {
    const digits = cpf.replace(/\D/g, '');
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  };

  const infoSections = [
    {
      title: 'Dados Pessoais',
      items: [
        { icon: User, label: 'Nome', value: cliente.nome },
        { icon: User, label: 'CPF/CNPJ', value: formatCPF(cliente.cpf_cnpj) },
        { icon: Phone, label: 'Celular', value: cliente.celular || '-' },
        { icon: Phone, label: 'Telefone', value: cliente.telefone || '-' },
        { icon: Mail, label: 'E-mail', value: cliente.email || '-' },
      ],
    },
    {
      title: 'Endereço',
      items: [
        { 
          icon: MapPin, 
          label: 'Endereço', 
          value: `${cliente.endereco}, ${cliente.numero}` 
        },
        { icon: MapPin, label: 'Bairro', value: cliente.bairro },
        { icon: MapPin, label: 'Cidade/UF', value: `${cliente.cidade} - ${cliente.estado}` },
        { icon: MapPin, label: 'CEP', value: cliente.cep || '-' },
      ],
    },
    {
      title: 'Plano e Pagamento',
      items: [
        { icon: Wifi, label: 'Plano', value: cliente.plano_nome || cliente.plano },
        { 
          icon: CreditCard, 
          label: 'Valor', 
          value: new Intl.NumberFormat('pt-BR', { 
            style: 'currency', 
            currency: 'BRL' 
          }).format(cliente.valor_plano || 0)
        },
        { icon: Calendar, label: 'Vencimento', value: `Dia ${cliente.vencimento}` },
        { icon: Calendar, label: 'Cliente desde', value: new Date(cliente.data_cadastro).toLocaleDateString('pt-BR') },
      ],
    },
  ];

  return (
    <AppLayout title="Meu Contrato" showBack>
      <div className="p-4 space-y-4">
        {/* Status Card */}
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Status da conexão</p>
              <p className="font-semibold">
                {cliente.bloqueado ? 'Conexão bloqueada' : 'Conexão ativa'}
              </p>
            </div>
            <StatusBadge status={cliente.bloqueado ? 'bloqueado' : 'ativo'} />
          </CardContent>
        </Card>

        {/* Info Sections */}
        {infoSections.map((section, idx) => (
          <Card key={idx}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{section.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {section.items.map((item, itemIdx) => (
                <React.Fragment key={itemIdx}>
                  {itemIdx > 0 && <Separator />}
                  <div className="flex items-start gap-3">
                    <item.icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground">{item.label}</p>
                      <p className="text-sm font-medium break-words">{item.value}</p>
                    </div>
                  </div>
                </React.Fragment>
              ))}
            </CardContent>
          </Card>
        ))}

        {cliente.login && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Dados de Conexão</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-start gap-3">
                <Wifi className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-xs text-muted-foreground">Login PPPoE</p>
                  <p className="text-sm font-medium font-mono">{cliente.login}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
};

export default Contrato;
