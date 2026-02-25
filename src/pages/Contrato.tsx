import React, { useState } from 'react';
import { Wifi, MapPin, User, Phone, Mail, Calendar, CreditCard, FileText, ArrowDown, ArrowUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { AppLayout } from '@/components/AppLayout';
import { StatusBadge } from '@/components/StatusBadge';
import { useAuth } from '@/contexts/AuthContext';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

const Contrato: React.FC = () => {
  const { cliente } = useAuth();

  if (!cliente) {
    return null;
  }

  const contratos = cliente.contratos || [];
  const hasMultipleContracts = contratos.length > 1;

  const formatCPF = (cpf: string) => {
    const digits = cpf.replace(/\D/g, '');
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  };

  const formatCurrency = (value: number | null) => {
    if (!value) return 'Não informado';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const personalSection = {
    title: 'Dados Pessoais',
    items: [
      { icon: User, label: 'Nome', value: cliente.nome },
      { icon: User, label: 'CPF/CNPJ', value: formatCPF(cliente.cpf_cnpj) },
      { icon: Phone, label: 'Celular', value: cliente.celular || '-' },
      { icon: Phone, label: 'Telefone', value: cliente.telefone || '-' },
      { icon: Mail, label: 'E-mail', value: cliente.email || '-' },
    ],
  };

  const addressSection = {
    title: 'Endereço',
    items: [
      { icon: MapPin, label: 'Endereço', value: `${cliente.endereco}, ${cliente.numero}` },
      { icon: MapPin, label: 'Bairro', value: cliente.bairro },
      { icon: MapPin, label: 'Cidade/UF', value: `${cliente.cidade} - ${cliente.estado}` },
      { icon: MapPin, label: 'CEP', value: cliente.cep || '-' },
    ],
  };

  const renderInfoSection = (section: typeof personalSection) => (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{section.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {section.items.map((item, idx) => (
          <React.Fragment key={idx}>
            {idx > 0 && <Separator />}
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
  );

  const renderContractCard = (contrato: typeof contratos[0], index: number) => (
    <Card key={contrato.id}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            {contrato.plano_nome || `Contrato #${contrato.id}`}
          </CardTitle>
          {contrato.status && (
            <StatusBadge status={
              contrato.status === 'A' || contrato.status === 'Ativo' ? 'ativo' :
              contrato.status === 'B' || contrato.status === 'Bloqueado' ? 'bloqueado' :
              contrato.status
            } />
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-start gap-3">
          <CreditCard className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <div>
            <p className="text-xs text-muted-foreground">Valor</p>
            <p className="text-sm font-medium">{formatCurrency(contrato.valor)}</p>
          </div>
        </div>
        <Separator />
        <div className="flex items-start gap-3">
          <Calendar className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <div>
            <p className="text-xs text-muted-foreground">Vencimento</p>
            <p className="text-sm font-medium">{contrato.vencimento ? `Dia ${contrato.vencimento}` : 'Não informado'}</p>
          </div>
        </div>
        {contrato.data_inicio && (
          <>
            <Separator />
            <div className="flex items-start gap-3">
              <Calendar className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Início</p>
                <p className="text-sm font-medium">{new Date(contrato.data_inicio).toLocaleDateString('pt-BR')}</p>
              </div>
            </div>
          </>
        )}
        {(contrato.velocidade_download || contrato.velocidade_upload) && (
          <>
            <Separator />
            <div className="flex items-start gap-3">
              <Wifi className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">Velocidade</p>
                <div className="flex items-center gap-3 mt-0.5">
                  {contrato.velocidade_download && (
                    <span className="text-sm font-medium flex items-center gap-1">
                      <ArrowDown className="h-3 w-3 text-primary" />
                      {contrato.velocidade_download}
                    </span>
                  )}
                  {contrato.velocidade_upload && (
                    <span className="text-sm font-medium flex items-center gap-1">
                      <ArrowUp className="h-3 w-3 text-accent-foreground" />
                      {contrato.velocidade_upload}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );

  // Fallback: se não há contratos da API, mostrar dados do cliente como antes
  const fallbackPlanSection = {
    title: 'Plano e Pagamento',
    items: [
      { icon: Wifi, label: 'Plano', value: cliente.plano_nome || cliente.plano || 'Não informado' },
      { icon: CreditCard, label: 'Valor', value: formatCurrency(cliente.valor_plano) },
      { icon: Calendar, label: 'Vencimento', value: cliente.vencimento ? `Dia ${cliente.vencimento}` : 'Não informado' },
      { icon: Calendar, label: 'Cliente desde', value: cliente.data_cadastro ? new Date(cliente.data_cadastro).toLocaleDateString('pt-BR') : 'Não informado' },
    ],
  };

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

        {/* Dados Pessoais */}
        {renderInfoSection(personalSection)}

        {/* Endereço */}
        {renderInfoSection(addressSection)}

        {/* Contratos */}
        {contratos.length > 0 ? (
          <div className="space-y-2">
            <h3 className="font-semibold text-sm text-foreground px-1">
              {hasMultipleContracts ? `Contratos (${contratos.length})` : 'Contrato'}
            </h3>
            {contratos.map((c, i) => renderContractCard(c, i))}
          </div>
        ) : (
          renderInfoSection(fallbackPlanSection)
        )}

        {/* Dados de Conexão */}
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
