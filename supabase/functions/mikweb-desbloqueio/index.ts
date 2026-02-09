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

    // 1. Buscar dados do cliente (para usar endereço como fallback)
    console.log(`Buscando dados do cliente ${cliente_id}...`);
    const customerResponse = await fetch(
      `https://api.mikweb.com.br/v1/admin/customers/${cliente_id}`,
      { method: 'GET', headers: authHeaders }
    );

    let customerData: any = null;
    if (customerResponse.ok) {
      const custJson = await customerResponse.json();
      customerData = custJson.customer || custJson;
      console.log(`Cliente carregado: ${customerData.full_name}, endereço: ${customerData.street} ${customerData.number}, ${customerData.city}/${customerData.state}`);
    } else {
      console.error(`Erro ao buscar cliente: ${customerResponse.status}`);
    }

    // 2. Buscar o contrato do cliente
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
        JSON.stringify({ success: false, error: 'Nenhum contrato encontrado para o cliente.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const activeContract = contracts.find((c: any) => c.status === 'active') || contracts[0];
    const actualContractId = activeContract.id;
    console.log(`Contrato encontrado: id=${actualContractId}, status=${activeContract.status}, access_status=${activeContract.access_status}`);

    // 3. Buscar dados completos do contrato
    console.log(`Buscando dados completos do contrato ${actualContractId}...`);
    const contractDetailResponse = await fetch(
      `https://api.mikweb.com.br/v1/admin/customer_contracts/${actualContractId}`,
      { method: 'GET', headers: authHeaders }
    );

    let contractDetail: any = null;
    if (contractDetailResponse.ok) {
      const detailData = await contractDetailResponse.json();
      contractDetail = detailData.customer_contract || detailData;
      console.log(`Contrato detalhes: use_customer_address=${contractDetail.use_customer_address}`);
      console.log(`Contrato endereço: zip=${contractDetail.billing_address_zip_code}, street=${contractDetail.billing_address_street}, city=${contractDetail.billing_address_city}`);
    }

    // Helper: pegar valor do contrato ou fallback do cliente
    const getAddr = (contractField: string, customerField: string) => {
      const contractVal = contractDetail?.[contractField];
      const customerVal = customerData?.[customerField];
      // Se o contrato tem valor preenchido (não nulo/vazio), usar ele
      if (contractVal && contractVal.trim && contractVal.trim() !== '') return contractVal;
      if (contractVal && typeof contractVal !== 'string') return contractVal;
      // Senão, usar do cliente
      return customerVal || '';
    };

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

    // 5. Montar body do contrato com endereço correto (fallback do cliente)
    const contractUpdateBody = {
      access_status: 'access_activated',
      allow_release_in_trust: true,
      financial_options_status: contractDetail?.financial_options_status || 'default',
      discount_enabled: contractDetail?.discount_enabled ?? false,
      addition_enabled: contractDetail?.addition_enabled ?? false,
      billing_address_zip_code: getAddr('billing_address_zip_code', 'zip_code'),
      billing_address_street: getAddr('billing_address_street', 'street'),
      billing_address_number: getAddr('billing_address_number', 'number'),
      billing_address_complement: getAddr('billing_address_complement', 'complement'),
      billing_address_neighborhood: getAddr('billing_address_neighborhood', 'neighborhood'),
      billing_address_city: getAddr('billing_address_city', 'city'),
      billing_address_state: getAddr('billing_address_state', 'state'),
    };

    console.log(`PUT /customer_contracts/${actualContractId}:`, JSON.stringify(contractUpdateBody));

    const releaseResponse = await fetch(
      `https://api.mikweb.com.br/v1/admin/customer_contracts/${actualContractId}`,
      {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify(contractUpdateBody),
      }
    );
    const releaseText = await releaseResponse.text();
    console.log(`Resposta PUT contrato: ${releaseResponse.status} - ${releaseText.substring(0, 500)}`);

    if (!releaseResponse.ok) {
      console.error(`Falha ao atualizar contrato: ${releaseResponse.status}`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Não foi possível liberar o acesso (erro ${releaseResponse.status}). Entre em contato com o suporte.`,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verificar se access_status mudou
    let newAccessStatus = '';
    try {
      const releaseData = JSON.parse(releaseText);
      const updatedContract = releaseData.customer_contract || releaseData;
      newAccessStatus = updatedContract.access_status || '';
      console.log(`Novo access_status: ${newAccessStatus}`);
    } catch (e) {
      console.log('Não foi possível parsear resposta');
    }

    if (newAccessStatus !== 'access_activated') {
      console.warn(`access_status não mudou para access_activated (atual: ${newAccessStatus})`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'O contrato foi atualizado mas o acesso não foi liberado. Entre em contato com o suporte.',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 6. Registrar uso
    const { error: insertError } = await supabase
      .from('desbloqueio_logs')
      .insert({ cliente_id: Number(cliente_id) });

    if (insertError) console.error('Error logging desbloqueio:', insertError);

    console.log('Desbloqueio concluído com sucesso - access_status confirmado como access_activated');

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Desbloqueio realizado com sucesso! Aguarde alguns instantes para que a conexão seja restabelecida.',
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
