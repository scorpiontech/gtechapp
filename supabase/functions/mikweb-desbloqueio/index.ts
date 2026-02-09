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

    // 1. Buscar dados do cliente
    console.log(`Buscando dados do cliente ${cliente_id}...`);
    const customerResponse = await fetch(
      `https://api.mikweb.com.br/v1/admin/customers/${cliente_id}`,
      { method: 'GET', headers: authHeaders }
    );

    let customerData: any = null;
    if (customerResponse.ok) {
      const custJson = await customerResponse.json();
      customerData = custJson.customer || custJson;
    }

    // 2. Buscar contrato do cliente
    console.log(`Buscando contratos do cliente ${cliente_id}...`);
    const contractsResponse = await fetch(
      `https://api.mikweb.com.br/v1/admin/customer_contracts?customer_id=${cliente_id}`,
      { method: 'GET', headers: authHeaders }
    );

    if (!contractsResponse.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Não foi possível acessar o contrato do cliente.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const contractsData = await contractsResponse.json();
    const contracts = contractsData.customer_contracts || contractsData.contracts || contractsData.data || [];

    if (!Array.isArray(contracts) || contracts.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Nenhum contrato encontrado.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const activeContract = contracts.find((c: any) => c.status === 'active') || contracts[0];
    const actualContractId = activeContract.id;
    console.log(`Contrato: id=${actualContractId}, access_status=${activeContract.access_status}`);

    // 3. Buscar detalhes completos do contrato
    const contractDetailResponse = await fetch(
      `https://api.mikweb.com.br/v1/admin/customer_contracts/${actualContractId}`,
      { method: 'GET', headers: authHeaders }
    );

    let contractDetail: any = null;
    if (contractDetailResponse.ok) {
      const detailData = await contractDetailResponse.json();
      contractDetail = detailData.customer_contract || detailData;
    }

    // 4. Buscar boletos vencidos
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

    console.log(`Total billings: ${allBillings.length}`);

    const boletosVencidos = allBillings.filter((b: any) => {
      const sitName = (b.situation_name || b.situation?.name || '').toLowerCase().trim();
      return sitName === 'em atraso' || sitName === 'atrasado';
    });

    console.log(`Boletos vencidos: ${boletosVencidos.length}`);
    boletosVencidos.forEach((b: any) => {
      console.log(`Boleto vencido: id=${b.id}, contract_id=${b.contract_id}, value=${b.value}, due_day=${b.due_day}, all_fields=${Object.keys(b).join(',')}`);
    });

    if (boletosVencidos.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Nenhum boleto vencido encontrado.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const newDueDay = tomorrow.toISOString().split('T')[0];

    // 5. Tentar múltiplas abordagens para alterar a situação do boleto via contrato
    let success = false;
    let successMethod = '';

    for (const boleto of boletosVencidos) {
      const boletoId = boleto.id;
      const boletoContractId = boleto.contract_id || actualContractId;

      // Tentativa 1: POST /customer_contracts/{contract_id}/billings/{billing_id}
      console.log(`T1: POST /customer_contracts/${boletoContractId}/billings/${boletoId}`);
      let resp = await fetch(
        `https://api.mikweb.com.br/v1/admin/customer_contracts/${boletoContractId}/billings/${boletoId}`,
        {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ situation_id: 5, due_day: newDueDay }),
        }
      );
      let text = await resp.text();
      console.log(`T1 result: ${resp.status} - ${text.substring(0, 300)}`);
      if (resp.ok) { success = true; successMethod = 'T1'; break; }

      // Tentativa 2: PUT /customer_contracts/{contract_id}/billings/{billing_id}
      console.log(`T2: PUT /customer_contracts/${boletoContractId}/billings/${boletoId}`);
      resp = await fetch(
        `https://api.mikweb.com.br/v1/admin/customer_contracts/${boletoContractId}/billings/${boletoId}`,
        {
          method: 'PUT',
          headers: authHeaders,
          body: JSON.stringify({ situation_id: 5, due_day: newDueDay }),
        }
      );
      text = await resp.text();
      console.log(`T2 result: ${resp.status} - ${text.substring(0, 300)}`);
      if (resp.ok) { success = true; successMethod = 'T2'; break; }

      // Tentativa 3: POST /customer_contracts/{contract_id}/billings (criar pelo contrato)
      const createBody = {
        customer_id: Number(cliente_id),
        due_day: newDueDay,
        situation_id: 5,
        value: boleto.value,
        reference: boleto.reference || 'Mensalidade',
        type_billing: boleto.type_billing || 'M',
      };
      console.log(`T3: POST /customer_contracts/${boletoContractId}/billings`, JSON.stringify(createBody));
      resp = await fetch(
        `https://api.mikweb.com.br/v1/admin/customer_contracts/${boletoContractId}/billings`,
        {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify(createBody),
        }
      );
      text = await resp.text();
      console.log(`T3 result: ${resp.status} - ${text.substring(0, 300)}`);
      if (resp.ok) { success = true; successMethod = 'T3'; break; }

      // Tentativa 4: PUT /billings/{id} com contract_id no body
      console.log(`T4: PUT /billings/${boletoId} com contract_id`);
      resp = await fetch(
        `https://api.mikweb.com.br/v1/admin/billings/${boletoId}`,
        {
          method: 'PUT',
          headers: authHeaders,
          body: JSON.stringify({ 
            contract_id: boletoContractId,
            situation_id: 5, 
            due_day: newDueDay,
          }),
        }
      );
      text = await resp.text();
      console.log(`T4 result: ${resp.status} - ${text.substring(0, 300)}`);
      if (resp.ok) { success = true; successMethod = 'T4'; break; }

      // Tentativa 5: PUT /billings/{id} enviando TODOS os campos do boleto original
      const fullBillingBody: any = {
        customer_id: Number(cliente_id),
        contract_id: boletoContractId,
        due_day: newDueDay,
        situation_id: 5,
        value: boleto.value,
        reference: boleto.reference,
        type_billing: boleto.type_billing || 'M',
      };
      if (boleto.payment_account_id) fullBillingBody.payment_account_id = boleto.payment_account_id;
      if (boleto.form_payment) fullBillingBody.form_payment = boleto.form_payment;
      
      console.log(`T5: PUT /billings/${boletoId} full body`, JSON.stringify(fullBillingBody));
      resp = await fetch(
        `https://api.mikweb.com.br/v1/admin/billings/${boletoId}`,
        {
          method: 'PUT',
          headers: authHeaders,
          body: JSON.stringify(fullBillingBody),
        }
      );
      text = await resp.text();
      console.log(`T5 result: ${resp.status} - ${text.substring(0, 300)}`);
      if (resp.ok) { success = true; successMethod = 'T5'; break; }

      // Tentativa 6: POST /billings com contract_id (via contrato, como a API pede)
      const postBody = {
        customer_id: Number(cliente_id),
        contract_id: boletoContractId,
        due_day: newDueDay,
        situation_id: 5,
        value: boleto.value,
        reference: boleto.reference || 'Mensalidade',
        type_billing: boleto.type_billing || 'M',
      };
      console.log(`T6: POST /billings com contract_id`, JSON.stringify(postBody));
      resp = await fetch(
        `https://api.mikweb.com.br/v1/admin/billings`,
        {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify(postBody),
        }
      );
      text = await resp.text();
      console.log(`T6 result: ${resp.status} - ${text.substring(0, 300)}`);
      if (resp.ok) { success = true; successMethod = 'T6'; break; }

      // Tentativa 7: Listar endpoints disponíveis no contrato
      console.log(`T7: GET /customer_contracts/${boletoContractId}/billings`);
      resp = await fetch(
        `https://api.mikweb.com.br/v1/admin/customer_contracts/${boletoContractId}/billings`,
        { method: 'GET', headers: authHeaders }
      );
      text = await resp.text();
      console.log(`T7 result: ${resp.status} - ${text.substring(0, 300)}`);

      // Log all billing fields for debugging
      console.log(`Boleto completo: ${JSON.stringify(boleto).substring(0, 500)}`);
    }

    if (!success) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Não foi possível alterar a situação do boleto. Entre em contato com o suporte.',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 6. Registrar uso
    const { error: insertError } = await supabase
      .from('desbloqueio_logs')
      .insert({ cliente_id: Number(cliente_id) });

    if (insertError) console.error('Error logging desbloqueio:', insertError);

    console.log(`Desbloqueio concluído via ${successMethod}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Boleto alterado para "Em Observação" com sucesso! Aguarde alguns instantes para que a conexão seja restabelecida.',
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
