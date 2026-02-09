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

    // Helper para tentar um endpoint e logar resultado
    const tryEndpoint = async (label: string, url: string, method: string, body?: any) => {
      console.log(`${label}: ${method} ${url}${body ? ' ' + JSON.stringify(body) : ''}`);
      const resp = await fetch(url, {
        method,
        headers: authHeaders,
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const text = await resp.text();
      console.log(`${label}: ${resp.status} - ${text.substring(0, 400)}`);
      return { ok: resp.ok, status: resp.status, text };
    };

    // Buscar contrato do cliente
    const contractsResp = await fetch(
      `https://api.mikweb.com.br/v1/admin/customer_contracts?customer_id=${cliente_id}`,
      { method: 'GET', headers: authHeaders }
    );
    const contractsData = await contractsResp.json();
    const contracts = contractsData.customer_contracts || contractsData.contracts || contractsData.data || [];
    const activeContract = contracts?.find((c: any) => c.status === 'active') || contracts?.[0];
    const contractId = activeContract?.id;
    console.log(`Contrato: ${contractId}, access_status: ${activeContract?.access_status}`);

    // ========================================
    // TENTAR TODOS OS ENDPOINTS POSSÍVEIS
    // ========================================
    
    let success = false;
    let successLabel = '';

    // Grupo 1: Endpoints dedicados de status de acesso no CUSTOMER
    const customerEndpoints = [
      { label: 'A1', url: `https://api.mikweb.com.br/v1/admin/customers/${cliente_id}/access_status`, method: 'PUT', body: { access_status: 'L' } },
      { label: 'A2', url: `https://api.mikweb.com.br/v1/admin/customers/${cliente_id}/access_status`, method: 'POST', body: { access_status: 'L' } },
      { label: 'A3', url: `https://api.mikweb.com.br/v1/admin/customers/${cliente_id}/change_access_status`, method: 'PUT', body: { access_status: 'L' } },
      { label: 'A4', url: `https://api.mikweb.com.br/v1/admin/customers/${cliente_id}/change_access_status`, method: 'POST', body: { access_status: 'L' } },
      { label: 'A5', url: `https://api.mikweb.com.br/v1/admin/customers/${cliente_id}/unlock`, method: 'POST', body: {} },
      { label: 'A6', url: `https://api.mikweb.com.br/v1/admin/customers/${cliente_id}/release`, method: 'POST', body: {} },
    ];

    for (const ep of customerEndpoints) {
      if (success) break;
      const result = await tryEndpoint(ep.label, ep.url, ep.method, ep.body);
      if (result.ok) {
        success = true;
        successLabel = ep.label;
        // Verificar se realmente mudou
        try {
          const data = JSON.parse(result.text);
          const cust = data.customer || data;
          if (cust.access_status) {
            console.log(`${ep.label} - novo access_status: ${cust.access_status}`);
          }
        } catch(e) {}
      }
    }

    // Grupo 2: Endpoints dedicados de status de acesso no CONTRATO
    if (!success && contractId) {
      const contractEndpoints = [
        { label: 'B1', url: `https://api.mikweb.com.br/v1/admin/customer_contracts/${contractId}/access_status`, method: 'PUT', body: { access_status: 'access_activated' } },
        { label: 'B2', url: `https://api.mikweb.com.br/v1/admin/customer_contracts/${contractId}/access_status`, method: 'POST', body: { access_status: 'access_activated' } },
        { label: 'B3', url: `https://api.mikweb.com.br/v1/admin/customer_contracts/${contractId}/unlock`, method: 'POST', body: {} },
        { label: 'B4', url: `https://api.mikweb.com.br/v1/admin/customer_contracts/${contractId}/release`, method: 'POST', body: {} },
        { label: 'B5', url: `https://api.mikweb.com.br/v1/admin/customer_contracts/${contractId}/activate_access`, method: 'POST', body: {} },
        { label: 'B6', url: `https://api.mikweb.com.br/v1/admin/customer_contracts/${contractId}/change_access_status`, method: 'PUT', body: { access_status: 'access_activated' } },
        { label: 'B7', url: `https://api.mikweb.com.br/v1/admin/customer_contracts/${contractId}/change_access_status`, method: 'POST', body: { access_status: 'access_activated' } },
      ];

      for (const ep of contractEndpoints) {
        if (success) break;
        const result = await tryEndpoint(ep.label, ep.url, ep.method, ep.body);
        if (result.ok) {
          success = true;
          successLabel = ep.label;
        }
      }
    }

    // Grupo 3: Endpoint /logins para mudar status do login
    if (!success && contractId) {
      // Buscar logins do contrato
      const detailResp = await fetch(
        `https://api.mikweb.com.br/v1/admin/customer_contracts/${contractId}`,
        { method: 'GET', headers: authHeaders }
      );
      if (detailResp.ok) {
        const detailData = await detailResp.json();
        const contract = detailData.customer_contract || detailData;
        const logins = contract.logins || [];
        
        for (const login of logins) {
          if (success) break;
          if (login.login_type === 'internet' || login.authentication_type === 'pppoe') {
            const loginEndpoints = [
              { label: `C1-${login.id}`, url: `https://api.mikweb.com.br/v1/admin/logins/${login.id}`, method: 'PUT', body: { access_status: 'access_activated' } },
              { label: `C2-${login.id}`, url: `https://api.mikweb.com.br/v1/admin/logins/${login.id}/access_status`, method: 'PUT', body: { access_status: 'access_activated' } },
              { label: `C3-${login.id}`, url: `https://api.mikweb.com.br/v1/admin/customer_contract_logins/${login.id}`, method: 'PUT', body: { access_status: 'access_activated' } },
            ];

            for (const ep of loginEndpoints) {
              if (success) break;
              const result = await tryEndpoint(ep.label, ep.url, ep.method, ep.body);
              if (result.ok) {
                success = true;
                successLabel = ep.label;
              }
            }
          }
        }
      }
    }

    if (!success) {
      console.error('NENHUM endpoint funcionou para liberar o acesso');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Não foi possível realizar o desbloqueio. Entre em contato com o suporte.',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Registrar uso
    await supabase.from('desbloqueio_logs').insert({ cliente_id: Number(cliente_id) });
    console.log(`Desbloqueio concluído via ${successLabel}`);

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
