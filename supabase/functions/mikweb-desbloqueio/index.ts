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

    // 1. Buscar contratos do cliente (lista com dados completos)
    console.log(`Buscando contratos do cliente ${cliente_id}...`);
    const contractsResp = await fetch(
      `https://api.mikweb.com.br/v1/admin/customer_contracts?customer_id=${cliente_id}`,
      { method: 'GET', headers: authHeaders }
    );

    if (!contractsResp.ok) {
      console.error(`Erro ao buscar contratos: ${contractsResp.status}`);
      return new Response(
        JSON.stringify({ success: false, error: 'Erro ao acessar contrato.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const contractsData = await contractsResp.json();
    const contracts = contractsData.customer_contracts || contractsData.contracts || contractsData.data || [];
    const activeContract = contracts?.find((c: any) => c.status === 'active') || contracts?.[0];

    if (!activeContract) {
      return new Response(
        JSON.stringify({ success: false, error: 'Nenhum contrato encontrado.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const contractId = activeContract.id;
    console.log(`Contrato: id=${contractId}, access_status=${activeContract.access_status}`);

    // 2. PUT no contrato copiando TODOS os campos e alterando apenas access_status
    // Clonar o contrato inteiro e sobrescrever access_status
    const contractUpdateBody = { ...activeContract };
    
    // Remover campos read-only que a API não aceita no PUT
    delete contractUpdateBody.id;
    delete contractUpdateBody.customer;
    delete contractUpdateBody.logins;
    delete contractUpdateBody.items;
    delete contractUpdateBody.created_at;
    delete contractUpdateBody.updated_at;
    delete contractUpdateBody.activated_at;
    delete contractUpdateBody.paused_at;
    delete contractUpdateBody.canceled_at;
    delete contractUpdateBody.disabled_at;
    delete contractUpdateBody.access_disabled_at;
    delete contractUpdateBody.access_activated_at;
    delete contractUpdateBody.access_pending_at;
    delete contractUpdateBody.access_blocked_at;
    delete contractUpdateBody.activation_awaiting_signature_at;
    delete contractUpdateBody.activation_signeted_at;
    delete contractUpdateBody.activation_awaiting_payment_at;
    delete contractUpdateBody.activation_awaiting_instalation_at;
    delete contractUpdateBody.activation_done_at;
    delete contractUpdateBody.financial_in_day_at;
    delete contractUpdateBody.financial_pending_at;
    delete contractUpdateBody.financial_negated_at;
    delete contractUpdateBody.created_by;
    delete contractUpdateBody.updated_by;
    delete contractUpdateBody.signed_by_customer_successfully;
    delete contractUpdateBody.installation_completed_successfully;

    // Sobrescrever o access_status
    contractUpdateBody.access_status = 'access_activated';

    // Garantir campos obrigatórios que podem não vir no GET
    if (!contractUpdateBody.financial_options_status) contractUpdateBody.financial_options_status = 'pending';
    if (contractUpdateBody.discount_enabled === undefined) contractUpdateBody.discount_enabled = false;
    if (contractUpdateBody.addition_enabled === undefined) contractUpdateBody.addition_enabled = false;
    if (!contractUpdateBody.billing_type) contractUpdateBody.billing_type = 'postpaid';

    console.log(`PUT /customer_contracts/${contractId} - campos:`, Object.keys(contractUpdateBody).join(', '));

    const contractUpdateResp = await fetch(
      `https://api.mikweb.com.br/v1/admin/customer_contracts/${contractId}`,
      {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify(contractUpdateBody),
      }
    );

    const contractUpdateText = await contractUpdateResp.text();
    console.log(`PUT /customer_contracts/${contractId}: ${contractUpdateResp.status} - ${contractUpdateText.substring(0, 600)}`);

    let success = false;

    if (contractUpdateResp.ok) {
      try {
        const parsed = JSON.parse(contractUpdateText);
        const updated = parsed.customer_contract || parsed;
        console.log(`Novo access_status do contrato: ${updated.access_status}`);
        if (updated.access_status === 'access_activated') {
          success = true;
          console.log('Contrato desbloqueado com sucesso!');
        } else {
          console.log('PUT retornou 200 mas access_status não mudou para access_activated');
        }
      } catch (e) {
        // Se não consegue parsear, assume sucesso
        success = true;
      }
    } else {
      console.error(`PUT /customer_contracts falhou: ${contractUpdateResp.status}`);
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
