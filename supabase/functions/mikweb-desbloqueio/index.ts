import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_PER_MONTH = 1;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { cliente_id } = await req.json();

    if (!cliente_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'ID do cliente é obrigatório' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const apiToken = Deno.env.get('MIKWEB_API_TOKEN');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!apiToken || !supabaseUrl || !supabaseKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Configuração do servidor incompleta' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verificar limite mensal
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const { data: logs } = await supabase
      .from('desbloqueio_logs')
      .select('id')
      .eq('cliente_id', cliente_id)
      .gte('created_at', firstOfMonth);

    const usageCount = logs?.length || 0;
    console.log(`Cliente ${cliente_id} - desbloqueios este mês: ${usageCount}`);

    if (usageCount >= MAX_PER_MONTH) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Limite atingido: ${usageCount}/${MAX_PER_MONTH} vez(es) este mês.`,
          limit_reached: true,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const authHeaders = {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    };

    // 1. Buscar contratos do cliente e identificar o bloqueado
    console.log(`Buscando contratos do cliente ${cliente_id}...`);
    const contractsResp = await fetch(
      `https://api.mikweb.com.br/v1/admin/customer_contracts?customer_id=${cliente_id}`,
      { method: 'GET', headers: authHeaders }
    );

    let contractId: number | null = null;
    let contracts: any[] = [];

    if (contractsResp.ok) {
      const contractsData = await contractsResp.json();
      contracts = contractsData.customer_contracts || contractsData.contracts || contractsData.data || [];
      
      console.log(`Total de contratos encontrados: ${contracts?.length || 0}`);
      
      // Listar todos os contratos para debug
      contracts?.forEach((c: any) => {
        console.log(`  Contrato id=${c.id}, status=${c.status}, access_status=${c.access_status}`);
      });

      // Filtrar apenas contratos bloqueados (ignorar cancelados e ativos com financeiro em dia)
      const blockedStatuses = ['b', 'access_blocked', 'access_pending', 'ca', 'cm'];
      const blockedContract = contracts?.find((c: any) => {
        const accessStatus = (c.access_status || '').toLowerCase();
        const isCancelled = (c.status || '').toLowerCase() === 'cancelled' || (c.status || '').toLowerCase() === 'canceled';
        
        // Ignorar contratos cancelados
        if (isCancelled) {
          console.log(`  Contrato id=${c.id} ignorado: cancelado`);
          return false;
        }
        
        // Selecionar apenas contratos com acesso bloqueado
        const isBlocked = blockedStatuses.includes(accessStatus);
        if (!isBlocked) {
          console.log(`  Contrato id=${c.id} ignorado: acesso liberado (${accessStatus || c.status})`);
        }
        return isBlocked;
      });

      if (blockedContract) {
        contractId = blockedContract.id;
        console.log(`Contrato BLOQUEADO selecionado: id=${contractId}, access_status=${blockedContract.access_status}`);
      } else {
        // Nenhum contrato bloqueado encontrado
        const hasActiveContracts = contracts?.some((c: any) => (c.status || '').toLowerCase() === 'active');
        if (hasActiveContracts) {
          console.log('Nenhum contrato bloqueado encontrado. Todos os contratos ativos estão com acesso liberado.');
        }
      }
    }

    let success = false;
    let unlockedContractId: number | null = contractId;
    let unlockedContractPlan: string | null = null;

    if (contractId) {
      // Guardar info do contrato desbloqueado
      const targetContract = contracts?.find((c: any) => c.id === contractId);
      if (targetContract) {
        unlockedContractPlan = targetContract.name || targetContract.plan_name || targetContract.plan || null;
      }
      // Tentar múltiplos endpoints para liberar acesso via contrato
      const endpoints = [
        { url: `https://api.mikweb.com.br/v1/admin/customer_contracts/${contractId}/access_status`, body: { access_status: 'access_activated' }, label: `customer_contracts/${contractId}/access_status` },
        { url: `https://api.mikweb.com.br/v1/admin/customer_contracts/${contractId}/msg_payment`, body: { msg_payment_mk: 'L' }, label: `customer_contracts/${contractId}/msg_payment` },
        { url: `https://api.mikweb.com.br/v1/admin/customers/${cliente_id}/msg_payment`, body: { msg_payment_mk: 'L' }, label: `customers/${cliente_id}/msg_payment` },
      ];

      for (const ep of endpoints) {
        if (success) break;
        console.log(`Tentando: PUT /${ep.label}...`);
        try {
          const resp = await fetch(ep.url, {
            method: 'PUT',
            headers: authHeaders,
            body: JSON.stringify(ep.body),
          });
          const text = await resp.text();
          console.log(`PUT /${ep.label}: ${resp.status} - ${text.substring(0, 400)}`);
          if (resp.ok) {
            success = true;
            console.log(`Acesso liberado via ${ep.label}!`);
          }
        } catch (e) {
          console.error(`Erro em ${ep.label}:`, e);
        }
      }
    } else {
      // Sem contrato, tentar direto pelo cliente
      console.log(`Sem contrato, tentando via PUT /customers/${cliente_id}/msg_payment...`);
      const unlockResp = await fetch(
        `https://api.mikweb.com.br/v1/admin/customers/${cliente_id}/msg_payment`,
        {
          method: 'PUT',
          headers: authHeaders,
          body: JSON.stringify({ msg_payment_mk: 'L' }),
        }
      );
      const unlockText = await unlockResp.text();
      console.log(`PUT /customers/${cliente_id}/msg_payment: ${unlockResp.status} - ${unlockText.substring(0, 600)}`);

      if (unlockResp.ok) {
        success = true;
        console.log('Acesso liberado via cliente!');
      }
    }

    // 2. Verificar boletos e colocar em observação se necessário
    try {
      console.log(`Buscando boletos do cliente ${cliente_id}...`);
      const billingsResp = await fetch(
        `https://api.mikweb.com.br/v1/admin/billings?customer_id=${cliente_id}`,
        { method: 'GET', headers: authHeaders }
      );

      if (billingsResp.ok) {
        const billingsData = await billingsResp.json();
        const allBillings = billingsData.billings || billingsData.data || [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Filtrar boletos vencidos: situation_id 2 ou 3, com data de vencimento no passado
        const overdueBillings = allBillings.filter((b: any) => {
          const due = new Date(b.due_day || b.vencimento);
          return due < today && [2, 3].includes(b.situation_id);
        });

        // Verificar se já existe boleto pago/confirmado pelo banco (situation_id 1 = pago)
        const hasRecentPayment = allBillings.some((b: any) => {
          const due = new Date(b.due_day || b.vencimento);
          const isPaid = b.situation_id === 1 
            || (b.situation_description || '').toLowerCase().includes('efetuado')
            || (b.situation_description || '').toLowerCase().includes('pago')
            || (b.situation_description || '').toLowerCase().includes('liquidado');
          // Considerar pagamentos do mês atual como confirmação bancária
          const isCurrentMonth = due.getMonth() === today.getMonth() && due.getFullYear() === today.getFullYear();
          return isPaid && isCurrentMonth;
        });

        if (hasRecentPayment) {
          console.log('Pagamento já confirmado pelo banco. Não é necessário colocar em observação.');
          if (!success) {
            success = true; // O acesso já deveria estar liberado pelo sistema
          }
        } else if (overdueBillings.length > 0) {
          // Ordenar por vencimento decrescente e pegar o mais recente
          overdueBillings.sort((a: any, b: any) => {
            const dateA = new Date(a.due_day || a.vencimento);
            const dateB = new Date(b.due_day || b.vencimento);
            return dateB.getTime() - dateA.getTime();
          });
          const latestBilling = overdueBillings[0];

          // Verificar se o status da cobrança já foi alterado para liberado/observação
          const alreadyReleased = (latestBilling.situation_description || '').toLowerCase().includes('observa')
            || latestBilling.situation_id === 4; // 4 = em observação em alguns sistemas

          if (alreadyReleased) {
            console.log(`Boleto ${latestBilling.id} já está em observação/liberado. Pulando add_observation.`);
            if (!success) success = true;
          } else {
            // Colocar em observação com lock_in = amanhã
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            const dd = String(tomorrow.getDate()).padStart(2, '0');
            const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
            const yyyy = tomorrow.getFullYear();
            const lockIn = `${dd}-${mm}-${yyyy}`;

            try {
              const obsResp = await fetch(
                `https://api.mikweb.com.br/v1/admin/billings/${latestBilling.id}/add_observation`,
                {
                  method: 'PUT',
                  headers: authHeaders,
                  body: JSON.stringify({ lock_in: lockIn }),
                }
              );
              const obsText = await obsResp.text();
              console.log(`PUT /billings/${latestBilling.id}/add_observation (lock_in=${lockIn}): ${obsResp.status} - ${obsText.substring(0, 300)}`);
              if (obsResp.ok && !success) {
                success = true;
              }
            } catch (billingErr) {
              console.error(`Erro ao colocar boleto ${latestBilling.id} em observação:`, billingErr);
            }
          }
        } else {
          console.log('Nenhum boleto vencido encontrado.');
        }
      }
    } catch (billingError) {
      console.error('Erro ao processar boletos (não crítico):', billingError);
    }

    if (!success) {
      return new Response(
        JSON.stringify({ success: false, error: 'Não foi possível liberar o acesso. Entre em contato com o suporte.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Registrar uso
    await supabase.from('desbloqueio_logs').insert({ cliente_id: Number(cliente_id) });
    console.log('Desbloqueio concluído com sucesso');

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Desbloqueio realizado com sucesso! Aguarde alguns instantes para que a conexão seja restabelecida.',
        contrato_id: unlockedContractId || null,
        contrato_plano: unlockedContractPlan || null,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Erro interno do servidor' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
