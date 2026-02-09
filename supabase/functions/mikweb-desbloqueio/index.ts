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

    // 1. Buscar contrato do cliente para obter o contract_id
    console.log(`Buscando contratos do cliente ${cliente_id}...`);
    const contractsResp = await fetch(
      `https://api.mikweb.com.br/v1/admin/customer_contracts?customer_id=${cliente_id}`,
      { method: 'GET', headers: authHeaders }
    );

    let contractId: number | null = null;

    if (contractsResp.ok) {
      const contractsData = await contractsResp.json();
      const contracts = contractsData.customer_contracts || contractsData.contracts || contractsData.data || [];
      const activeContract = contracts?.find((c: any) => c.status === 'active') || contracts?.[0];
      if (activeContract) {
        contractId = activeContract.id;
        console.log(`Contrato encontrado: id=${contractId}, access_status=${activeContract.access_status}`);
      }
    }

    let success = false;

    if (contractId) {
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

    // 2. Tentar colocar boletos vencidos em observação (resiliência - não bloqueia se falhar)
    try {
      console.log(`Buscando boletos vencidos do cliente ${cliente_id}...`);
      const billingsResp = await fetch(
        `https://api.mikweb.com.br/v1/admin/billings?customer_id=${cliente_id}&situation_id=3`,
        { method: 'GET', headers: authHeaders }
      );

      if (billingsResp.ok) {
        const billingsData = await billingsResp.json();
        const billings = billingsData.billings || billingsData.data || [];
        console.log(`Boletos vencidos encontrados: ${billings.length}`);

        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = tomorrow.toISOString().split('T')[0];

        for (const billing of billings) {
          try {
            // Colocar em observação
            const obsResp = await fetch(
              `https://api.mikweb.com.br/v1/admin/billings/${billing.id}/observation`,
              { method: 'PUT', headers: authHeaders }
            );
            console.log(`PUT /billings/${billing.id}/observation: ${obsResp.status}`);

            // Atualizar vencimento para amanhã
            const updateResp = await fetch(
              `https://api.mikweb.com.br/v1/admin/billings/${billing.id}`,
              {
                method: 'PUT',
                headers: authHeaders,
                body: JSON.stringify({ due_day: tomorrowStr }),
              }
            );
            console.log(`PUT /billings/${billing.id} (vencimento ${tomorrowStr}): ${updateResp.status}`);
          } catch (billingErr) {
            console.error(`Erro ao atualizar boleto ${billing.id}:`, billingErr);
          }
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
