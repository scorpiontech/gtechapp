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

    // 1. Buscar contratos do cliente
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
    console.log(`Contrato encontrado: id=${contractId}, access_status=${activeContract.access_status}`);

    // 2. Tentar atualizar o contrato diretamente com PUT
    // Enviar todos os campos obrigatórios do contrato + access_status alterado
    const contractUpdateBody: any = {
      access_status: 'access_activated',
    };

    // Copiar campos obrigatórios do contrato original
    const requiredFields = [
      'billing_address_zip_code', 'billing_address_street', 'billing_address_number',
      'billing_address_complement', 'billing_address_neighborhood', 'billing_address_city',
      'billing_address_state', 'billing_email', 'subscriber_type', 'repeat_every',
      'repeat_on', 'contract_template_id', 'payment_account_id',
      'subtotal', 'total', 'start_date', 'end_date',
    ];

    for (const field of requiredFields) {
      if (activeContract[field] !== undefined && activeContract[field] !== null) {
        contractUpdateBody[field] = activeContract[field];
      }
    }

    console.log(`PUT /customer_contracts/${contractId}:`, JSON.stringify(contractUpdateBody));

    const contractUpdateResp = await fetch(
      `https://api.mikweb.com.br/v1/admin/customer_contracts/${contractId}`,
      {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify(contractUpdateBody),
      }
    );

    const contractUpdateText = await contractUpdateResp.text();
    console.log(`PUT /customer_contracts/${contractId}: ${contractUpdateResp.status} - ${contractUpdateText.substring(0, 500)}`);

    let contractUpdated = false;

    if (contractUpdateResp.ok) {
      try {
        const parsed = JSON.parse(contractUpdateText);
        const updated = parsed.customer_contract || parsed;
        console.log(`Novo access_status do contrato: ${updated.access_status}`);
        if (updated.access_status === 'access_activated') {
          contractUpdated = true;
          console.log('Contrato atualizado com sucesso via PUT!');
        } else {
          console.log('PUT retornou 200 mas access_status não mudou');
        }
      } catch (e) {
        console.log('PUT retornou 200, assumindo sucesso');
        contractUpdated = true;
      }
    } else {
      console.error(`PUT /customer_contracts falhou: ${contractUpdateResp.status}`);
      
      // Fallback: tentar PATCH no contrato
      console.log(`Tentando PATCH /customer_contracts/${contractId}`);
      const patchResp = await fetch(
        `https://api.mikweb.com.br/v1/admin/customer_contracts/${contractId}`,
        {
          method: 'PATCH',
          headers: authHeaders,
          body: JSON.stringify({ access_status: 'access_activated' }),
        }
      );
      const patchText = await patchResp.text();
      console.log(`PATCH /customer_contracts/${contractId}: ${patchResp.status} - ${patchText.substring(0, 500)}`);

      if (patchResp.ok) {
        contractUpdated = true;
        console.log('Contrato atualizado via PATCH!');
      }
    }

    // 3. Se contrato não atualizou, tentar via logins como fallback
    if (!contractUpdated) {
      console.log('Contrato não atualizado, tentando via logins...');
      
      const detailResp = await fetch(
        `https://api.mikweb.com.br/v1/admin/customer_contracts/${contractId}`,
        { method: 'GET', headers: authHeaders }
      );

      if (detailResp.ok) {
        const detailData = await detailResp.json();
        const contract = detailData.customer_contract || detailData;
        const logins = contract.logins || [];
        
        console.log(`Logins encontrados: ${logins.length}`);

        for (const login of logins) {
          if (login.login_type !== 'internet' && login.authentication_type !== 'pppoe') {
            continue;
          }

          const loginBody: any = {
            access_status: 'access_activated',
            login: login.login,
            password: login.password,
            plan_id: login.plan_id,
            server_id: login.server_id,
            contract_id: login.contract_id || contractId,
            contract_item_id: login.contract_item_id,
          };
          if (login.ip) loginBody.ip = login.ip;
          if (login.mac) loginBody.mac = login.mac;
          if (login.longitude) loginBody.longitude = login.longitude;
          if (login.latitude) loginBody.latitude = login.latitude;

          console.log(`PUT /logins/${login.id}:`, JSON.stringify(loginBody));
          const updateResp = await fetch(
            `https://api.mikweb.com.br/v1/admin/logins/${login.id}`,
            { method: 'PUT', headers: authHeaders, body: JSON.stringify(loginBody) }
          );
          const updateText = await updateResp.text();
          console.log(`PUT /logins/${login.id}: ${updateResp.status} - ${updateText.substring(0, 400)}`);

          if (updateResp.ok) {
            contractUpdated = true;
          }
        }
      }
    }

    if (!contractUpdated) {
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
