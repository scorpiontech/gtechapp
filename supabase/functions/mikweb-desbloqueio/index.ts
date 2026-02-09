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
    const { cliente_id, contrato_id } = await req.json();

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

    // 0. Verificar limite mensal
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const { data: logs, error: logError } = await supabase
      .from('desbloqueio_logs')
      .select('id, created_at')
      .eq('cliente_id', cliente_id)
      .gte('created_at', firstOfMonth)
      .order('created_at', { ascending: false });

    if (logError) console.error('Error checking logs:', logError);

    const usageCount = logs?.length || 0;
    console.log(`Cliente ${cliente_id} - desbloqueios este mês: ${usageCount}`);

    if (usageCount >= MAX_PER_MONTH) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Você já utilizou o autodesbloqueio ${usageCount} vez(es) este mês. O limite é de ${MAX_PER_MONTH} vez por mês.`,
          limit_reached: true,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const authHeaders = {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    };

    // 1. Buscar o contrato do cliente
    console.log(`Buscando contratos do cliente ${cliente_id}...`);
    const contractsResponse = await fetch(
      `https://api.mikweb.com.br/v1/admin/customer_contracts?customer_id=${cliente_id}`,
      { method: 'GET', headers: authHeaders }
    );

    if (!contractsResponse.ok) {
      console.error('Erro ao buscar contratos:', contractsResponse.status);
      return new Response(
        JSON.stringify({ success: false, error: 'Não foi possível acessar o contrato do cliente.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const contractsData = await contractsResponse.json();
    const contracts = contractsData.customer_contracts || contractsData.contracts || contractsData.data || [];

    if (!Array.isArray(contracts) || contracts.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Nenhum contrato encontrado para o cliente.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const activeContract = contracts.find((c: any) => c.status === 'active') || contracts[0];
    const actualContractId = activeContract.id;
    console.log(`Contrato encontrado: id=${actualContractId}, status=${activeContract.status}, access_status=${activeContract.access_status}`);

    // 2. Buscar dados completos do contrato
    console.log(`Buscando dados completos do contrato ${actualContractId}...`);
    const contractDetailResponse = await fetch(
      `https://api.mikweb.com.br/v1/admin/customer_contracts/${actualContractId}`,
      { method: 'GET', headers: authHeaders }
    );

    let contractDetail: any = null;
    if (contractDetailResponse.ok) {
      const detailData = await contractDetailResponse.json();
      contractDetail = detailData.customer_contract || detailData;
      console.log(`Contrato detalhes obtidos`);
    } else {
      console.error(`Erro ao buscar detalhes do contrato: ${contractDetailResponse.status}`);
    }

    // 3. Buscar boletos vencidos
    let allBillings: any[] = [];
    let page = 1;

    while (true) {
      const response = await fetch(
        `https://api.mikweb.com.br/v1/admin/billings?customer_id=${cliente_id}&page=${page}&per_page=100`,
        { method: 'GET', headers: authHeaders }
      );
      if (!response.ok) break;

      const data = await response.json();
      const pageBillings = data.billings || data.data || [];
      if (!Array.isArray(pageBillings) || pageBillings.length === 0) break;
      allBillings = allBillings.concat(pageBillings);
      if (pageBillings.length < 100) break;
      page++;
      if (page > 20) break;
    }

    console.log(`Total billings fetched: ${allBillings.length}`);

    const boletosVencidos = allBillings.filter((b: any) => {
      const sitName = (b.situation_name || b.situation?.name || '').toLowerCase().trim();
      return sitName === 'em atraso' || sitName === 'atrasado';
    });

    console.log(`Boletos vencidos encontrados: ${boletosVencidos.length}`);
    boletosVencidos.forEach((b: any) => {
      console.log(`Boleto vencido: id=${b.id}, contract_id=${b.contract_id}, value=${b.value}, due_day=${b.due_day}`);
    });

    if (boletosVencidos.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Nenhum boleto vencido encontrado.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Data do dia seguinte
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const newDueDay = tomorrow.toISOString().split('T')[0];

    // 5. Liberar acesso via contrato com allow_release_in_trust
    // A API MikWeb exige que alterações em boletos sejam feitas pelo contrato
    // Usar PUT no contrato para liberar o acesso e alterar a situação
    
    const contractUpdateBody: any = {
      access_status: 'access_activated',
      allow_release_in_trust: true,
    };

    // Incluir campos obrigatórios do contrato
    if (contractDetail) {
      contractUpdateBody.financial_options_status = contractDetail.financial_options_status || 'default';
      contractUpdateBody.discount_enabled = contractDetail.discount_enabled ?? false;
      contractUpdateBody.addition_enabled = contractDetail.addition_enabled ?? false;
      contractUpdateBody.billing_address_zip_code = contractDetail.billing_address_zip_code || '';
      contractUpdateBody.billing_address_street = contractDetail.billing_address_street || '';
      contractUpdateBody.billing_address_number = contractDetail.billing_address_number || '';
      contractUpdateBody.billing_address_complement = contractDetail.billing_address_complement || '';
      contractUpdateBody.billing_address_neighborhood = contractDetail.billing_address_neighborhood || '';
      contractUpdateBody.billing_address_city = contractDetail.billing_address_city || '';
      contractUpdateBody.billing_address_state = contractDetail.billing_address_state || '';
    }

    console.log(`Tentativa 1: PUT /customer_contracts/${actualContractId} com allow_release_in_trust`, JSON.stringify(contractUpdateBody));
    const releaseResponse = await fetch(
      `https://api.mikweb.com.br/v1/admin/customer_contracts/${actualContractId}`,
      {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify(contractUpdateBody),
      }
    );
    const releaseText = await releaseResponse.text();
    console.log(`PUT /customer_contracts/${actualContractId}: ${releaseResponse.status} - ${releaseText}`);

    // Verificar se o access_status mudou
    let accessUpdated = false;
    if (releaseResponse.ok) {
      try {
        const releaseData = JSON.parse(releaseText);
        const updatedContract = releaseData.customer_contract || releaseData;
        const newAccessStatus = updatedContract.access_status;
        console.log(`Novo access_status após PUT: ${newAccessStatus}`);
        accessUpdated = newAccessStatus === 'access_activated';
      } catch (e) {
        console.log('Não foi possível parsear resposta do contrato');
      }
    }

    // Tentativa 2: Se o access_status não mudou, tentar POST release_in_trust
    if (!accessUpdated) {
      console.log(`Tentativa 2: POST /customer_contracts/${actualContractId}/release_in_trust`);
      const trustResponse = await fetch(
        `https://api.mikweb.com.br/v1/admin/customer_contracts/${actualContractId}/release_in_trust`,
        {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({}),
        }
      );
      const trustText = await trustResponse.text();
      console.log(`POST /release_in_trust: ${trustResponse.status} - ${trustText}`);

      if (trustResponse.ok) {
        accessUpdated = true;
      }
    }

    // Tentativa 3: PUT no contrato apenas com access_status (sem outros campos)
    if (!accessUpdated) {
      console.log(`Tentativa 3: PUT /customer_contracts/${actualContractId} somente access_status`);
      const simpleResponse = await fetch(
        `https://api.mikweb.com.br/v1/admin/customer_contracts/${actualContractId}`,
        {
          method: 'PUT',
          headers: authHeaders,
          body: JSON.stringify({ access_status: 'access_activated' }),
        }
      );
      const simpleText = await simpleResponse.text();
      console.log(`PUT simples: ${simpleResponse.status} - ${simpleText}`);

      if (simpleResponse.ok) {
        try {
          const simpleData = JSON.parse(simpleText);
          const sc = simpleData.customer_contract || simpleData;
          accessUpdated = sc.access_status === 'access_activated';
          console.log(`access_status após PUT simples: ${sc.access_status}`);
        } catch (e) {}
      }
    }

    // Tentativa 4: PATCH no contrato
    if (!accessUpdated) {
      console.log(`Tentativa 4: PATCH /customer_contracts/${actualContractId}`);
      const patchResponse = await fetch(
        `https://api.mikweb.com.br/v1/admin/customer_contracts/${actualContractId}`,
        {
          method: 'PATCH',
          headers: authHeaders,
          body: JSON.stringify({ access_status: 'access_activated' }),
        }
      );
      const patchText = await patchResponse.text();
      console.log(`PATCH: ${patchResponse.status} - ${patchText}`);

      if (patchResponse.ok) {
        accessUpdated = true;
      }
    }

    // Tentativa 5: PUT no customer com access_status
    if (!accessUpdated) {
      console.log(`Tentativa 5: PUT /customers/${cliente_id} com access_status`);
      const custResponse = await fetch(
        `https://api.mikweb.com.br/v1/admin/customers/${cliente_id}`,
        {
          method: 'PUT',
          headers: authHeaders,
          body: JSON.stringify({ access_status: 'L' }),
        }
      );
      const custText = await custResponse.text();
      console.log(`PUT /customers/${cliente_id}: ${custResponse.status} - ${custText}`);

      if (custResponse.ok) {
        accessUpdated = true;
      }
    }

    // Tentativa 6: Endpoint de alteração de status de acesso
    if (!accessUpdated) {
      console.log(`Tentativa 6: PUT /customers/${cliente_id}/change_access_status`);
      const changeResponse = await fetch(
        `https://api.mikweb.com.br/v1/admin/customers/${cliente_id}/change_access_status`,
        {
          method: 'PUT',
          headers: authHeaders,
          body: JSON.stringify({ access_status: 'L' }),
        }
      );
      const changeText = await changeResponse.text();
      console.log(`PUT /change_access_status: ${changeResponse.status} - ${changeText}`);

      if (changeResponse.ok) {
        accessUpdated = true;
      }
    }

    if (!accessUpdated) {
      console.error('Nenhuma tentativa conseguiu liberar o acesso');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Não foi possível liberar o acesso. Entre em contato com o suporte.',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 6. Registrar uso
    const { error: insertError } = await supabase
      .from('desbloqueio_logs')
      .insert({ cliente_id: Number(cliente_id) });

    if (insertError) console.error('Error logging desbloqueio:', insertError);

    console.log('Desbloqueio concluído com sucesso');

    return new Response(
      JSON.stringify({
        success: true,
        message: `Desbloqueio realizado com sucesso! Sua conexão será liberada em instantes.`,
        boletos_atualizados: boletosVencidos.length,
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
