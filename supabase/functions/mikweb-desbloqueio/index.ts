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

    // 1. Buscar contrato completo com logins
    console.log(`Buscando contratos do cliente ${cliente_id}...`);
    const contractsResp = await fetch(
      `https://api.mikweb.com.br/v1/admin/customer_contracts?customer_id=${cliente_id}`,
      { method: 'GET', headers: authHeaders }
    );

    if (!contractsResp.ok) {
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

    // 2. Buscar detalhes completos do contrato (inclui logins)
    const detailResp = await fetch(
      `https://api.mikweb.com.br/v1/admin/customer_contracts/${contractId}`,
      { method: 'GET', headers: authHeaders }
    );

    if (!detailResp.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Erro ao acessar detalhes do contrato.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const detailData = await detailResp.json();
    const contract = detailData.customer_contract || detailData;
    const logins = contract.logins || [];
    
    console.log(`Logins encontrados: ${logins.length}`);
    logins.forEach((l: any) => {
      console.log(`Login: id=${l.id}, type=${l.login_type}, auth=${l.authentication_type}, login=${l.login}, access_status=${l.access_status}, plan_id=${l.plan_id}, server_id=${l.server_id}`);
    });

    // 3. Atualizar cada login PPPoE para access_activated
    let anyLoginUpdated = false;

    for (const login of logins) {
      // Focar em logins de internet (PPPoE)
      if (login.login_type !== 'internet' && login.authentication_type !== 'pppoe') {
        console.log(`Pulando login ${login.id} (tipo: ${login.login_type})`);
        continue;
      }

      if (login.access_status === 'access_activated') {
        console.log(`Login ${login.id} já está ativado`);
        anyLoginUpdated = true;
        continue;
      }

      // Montar body com todos os campos do login para evitar erro de validação
      const loginUpdateBody: any = {
        access_status: 'access_activated',
        login: login.login,
        password: login.password,
        plan_id: login.plan_id,
        server_id: login.server_id,
        contract_id: login.contract_id || contractId,
        contract_item_id: login.contract_item_id,
      };

      // Incluir campos opcionais se existirem
      if (login.ip) loginUpdateBody.ip = login.ip;
      if (login.mac) loginUpdateBody.mac = login.mac;
      if (login.longitude) loginUpdateBody.longitude = login.longitude;
      if (login.latitude) loginUpdateBody.latitude = login.latitude;

      console.log(`Atualizando login ${login.id}: PUT /logins/${login.id}`, JSON.stringify(loginUpdateBody));
      
      const updateResp = await fetch(
        `https://api.mikweb.com.br/v1/admin/logins/${login.id}`,
        {
          method: 'PUT',
          headers: authHeaders,
          body: JSON.stringify(loginUpdateBody),
        }
      );
      const updateText = await updateResp.text();
      console.log(`PUT /logins/${login.id}: ${updateResp.status} - ${updateText.substring(0, 400)}`);

      if (updateResp.ok) {
        anyLoginUpdated = true;
        console.log(`Login ${login.id} atualizado com sucesso!`);
        
        // Verificar se access_status mudou
        try {
          const data = JSON.parse(updateText);
          const updatedLogin = data.login || data;
          console.log(`Novo access_status do login: ${updatedLogin.access_status}`);
        } catch(e) {}
      } else {
        console.error(`Falha ao atualizar login ${login.id}: ${updateResp.status}`);
        
        // Tentar PATCH como fallback
        console.log(`Tentando PATCH /logins/${login.id}`);
        const patchResp = await fetch(
          `https://api.mikweb.com.br/v1/admin/logins/${login.id}`,
          {
            method: 'PATCH',
            headers: authHeaders,
            body: JSON.stringify({ access_status: 'access_activated' }),
          }
        );
        const patchText = await patchResp.text();
        console.log(`PATCH /logins/${login.id}: ${patchResp.status} - ${patchText.substring(0, 400)}`);
        
        if (patchResp.ok) {
          anyLoginUpdated = true;
          console.log(`Login ${login.id} atualizado via PATCH!`);
        }
      }
    }

    if (!anyLoginUpdated) {
      console.error('Nenhum login foi atualizado');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Não foi possível liberar o acesso. Entre em contato com o suporte.',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Registrar uso
    await supabase.from('desbloqueio_logs').insert({ cliente_id: Number(cliente_id) });
    console.log('Desbloqueio concluído com sucesso via login update');

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
