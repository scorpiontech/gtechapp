import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { cpf } = await req.json();

    if (!cpf) {
      return new Response(
        JSON.stringify({ success: false, error: 'CPF/CNPJ é obrigatório' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const apiToken = Deno.env.get('MIKWEB_API_TOKEN');
    if (!apiToken) {
      console.error('MIKWEB_API_TOKEN not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Configuração do servidor incompleta' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    const authHeaders = {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    };

    console.log('Token length:', apiToken.length);
    
    // Buscar cliente na API MikWeb usando o parâmetro search
    const cpfLimpo = cpf.replace(/\D/g, '');
    // A API MikWeb usa 'search' para filtrar clientes, não 'cpf_cnpj'
    const url = `https://api.mikweb.com.br/v1/admin/customers?search=${cpfLimpo}`;
    console.log('Fetching customers URL:', url);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: authHeaders,
    });

    const responseText = await response.text();
    console.log('MikWeb API response status:', response.status);

    if (!response.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Erro ao consultar dados', details: responseText }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    const data = JSON.parse(responseText);
    const clientes = data.customers || data.data || [];
    
    console.log('Total customers returned:', clientes.length);
    if (clientes.length > 0) {
      console.log('First customer CPF:', clientes[0].cpf_cnpj);
      console.log('Looking for CPF:', cpfLimpo);
      // Log available fields for debugging
      console.log('Customer fields:', Object.keys(clientes[0]).join(', '));
    }
    
    if (!Array.isArray(clientes) || clientes.length === 0) {
      console.log('No customers found in API response');
      return new Response(
        JSON.stringify({ success: false, error: 'CPF/CNPJ não encontrado' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Filtrar pelo CPF/CNPJ exato
    const clienteEncontrado = clientes.find((c: any) => {
      const cpfCliente = (c.cpf_cnpj || '').replace(/\D/g, '');
      return cpfCliente === cpfLimpo;
    });

    if (!clienteEncontrado) {
      return new Response(
        JSON.stringify({ success: false, error: 'CPF/CNPJ não encontrado' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // A busca por search retorna dados limitados, precisamos buscar o cliente por ID para obter todos os dados
    const clienteId = clienteEncontrado.id;
    console.log('Found customer ID:', clienteId);
    console.log('Fetching full customer details...');
    
    const detailsUrl = `https://api.mikweb.com.br/v1/admin/customers/${clienteId}`;
    const detailsResponse = await fetch(detailsUrl, {
      method: 'GET',
      headers: authHeaders,
    });
    
    if (!detailsResponse.ok) {
      console.log('Customer details fetch failed:', detailsResponse.status);
      // Fallback para usar os dados da busca inicial se não conseguir buscar detalhes
      const cliente = clienteEncontrado;
      return new Response(
        JSON.stringify({ 
          success: true, 
          cliente: {
            id: cliente.id,
            nome: cliente.full_name,
            cpf_cnpj: cliente.cpf_cnpj,
            email: cliente.email,
            celular: cliente.cell_phone_number_1,
            telefone: cliente.phone_number,
            endereco: cliente.street,
            numero: cliente.number,
            bairro: cliente.neighborhood,
            cidade: cliente.city,
            estado: cliente.state,
            cep: cliente.zip_code,
            status: cliente.status,
            data_cadastro: cliente.customer_since,
            login: cliente.login,
            plano: cliente.plan_id,
            plano_nome: null,
            valor_plano: null,
            vencimento: cliente.due_day,
            bloqueado: cliente.financial_status === 'B' || cliente.status === 'Bloqueado',
            servidor: cliente.server?.name,
            contrato_id: cliente.customer_contract_ids?.[0] || null,
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const detailsData = await detailsResponse.json();
    const cliente = detailsData.customer || detailsData;
    
    console.log('Customer details loaded');
    console.log('Plan object:', cliente.plan ? JSON.stringify(cliente.plan) : 'null');
    console.log('Due day:', cliente.due_day);

    // Verificar status financeiro para determinar se está bloqueado
    const isBloqueado = cliente.financial_status === 'B' || cliente.status === 'Bloqueado';

    const toNumberOrNull = (v: unknown): number | null => {
      if (v === null || v === undefined) return null;
      if (typeof v === 'number' && Number.isFinite(v)) return v;
      const s = String(v).replace(',', '.').trim();
      const n = Number(s);
      return Number.isFinite(n) ? n : null;
    };

    // 1) Tentar extrair do objeto plan retornado no detalhe do cliente
    let planoNome: string | null = cliente.plan?.name ?? null;
    let valorPlano: number | null = toNumberOrNull(cliente.plan?.value);
    let vencimento: number | null = toNumberOrNull(cliente.due_day);

    console.log('Extracted plano_nome (from customer.plan):', planoNome);
    console.log('Extracted valor_plano (from customer.plan):', valorPlano);
    console.log('Extracted vencimento (from customer.due_day):', vencimento);

    // 2) Se ainda estiver faltando, tentar buscar pelo contrato (customer_contracts / customer_contract_ids)
    const contratoId = Array.isArray(cliente.customer_contract_ids) ? cliente.customer_contract_ids[0] : null;
    const contratoFromCustomer = Array.isArray(cliente.customer_contracts) ? cliente.customer_contracts[0] : null;

    const applyContratoData = async (contrato: any, source: string) => {
      if (!contrato) return;
      console.log(`Applying contract data from ${source}`);
      console.log('Contract fields:', Object.keys(contrato).join(', '));

      // Nome/valor/vencimento podem vir em formatos diferentes dependendo da estrutura do provedor
      // Priorizar nome do plano real (plan.name) ou template (contract_template) em vez do nome do contrato
      planoNome = planoNome ?? contrato.plan?.name ?? contrato.plan_name ?? contrato.plan?.title ?? null;
      valorPlano =
        valorPlano ??
        toNumberOrNull(
          contrato.plan?.value ??
            contrato.value ??
            contrato.plan_value ??
            contrato.monthly_value ??
            contrato.total ??
            contrato.subtotal
        );

      const repeatOn = contrato.repeat_on;
      const dueFromRepeatOn = (() => {
        if (repeatOn === null || repeatOn === undefined) return null;
        if (typeof repeatOn === 'number') return repeatOn;
        const s = String(repeatOn).trim();
        // YYYY-MM-DD
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
          const d = new Date(s + 'T00:00:00Z');
          return Number.isFinite(d.getTime()) ? d.getUTCDate() : null;
        }
        return toNumberOrNull(s);
      })();

      vencimento = vencimento ?? toNumberOrNull(contrato.due_day ?? contrato.due_day_number ?? contrato.due_day_id) ?? dueFromRepeatOn;

      // Buscar template do contrato se não temos nome do plano
      const templateId = contrato.contract_template_id;
      console.log('Contract template_id:', templateId);
      if (!planoNome && templateId) {
        const templateUrl = `https://api.mikweb.com.br/v1/admin/contract_templates/${templateId}`;
        console.log('Fetching contract template URL:', templateUrl);

        const templateRes = await fetch(templateUrl, { method: 'GET', headers: authHeaders });
        if (templateRes.ok) {
          const templateJson: any = await templateRes.json();
          const template = templateJson?.contract_template || templateJson?.template || templateJson;
          console.log('Template fields:', template ? Object.keys(template).join(', ') : 'null');
          planoNome = template?.name ?? template?.title ?? template?.description ?? null;
          console.log('Template name extracted:', planoNome);
        } else {
          console.log('Contract template fetch failed:', templateRes.status);
        }
      }

      const planId = contrato.plan_id ?? contrato.plan?.id;
      if ((!planoNome || valorPlano === null) && planId) {
        const planUrl = `https://api.mikweb.com.br/v1/admin/plans/${planId}`;
        console.log('Fetching plan from contract plan_id URL:', planUrl);

        const planRes = await fetch(planUrl, { method: 'GET', headers: authHeaders });
        if (planRes.ok) {
          const planJson: any = await planRes.json();
          const plan = planJson?.plan || planJson;
          planoNome = planoNome ?? plan?.name ?? null;
          valorPlano = valorPlano ?? toNumberOrNull(plan?.value);
        } else {
          console.log('Plan fetch (from contract) failed:', planRes.status);
        }
      }
    };

    if (!planoNome || valorPlano === null || vencimento === null) {
      // 2.0) Preferir usar o objeto já embutido no retorno do cliente
      if (contratoFromCustomer) {
        await applyContratoData(contratoFromCustomer, 'customer.customer_contracts[0]');
      }

      // 2.1) Tentativa adicional: listar contratos por customer_id (normalmente retorna mais dados)
      if ((!planoNome || valorPlano === null || vencimento === null) && cliente.id) {
        const listUrl = `https://api.mikweb.com.br/v1/admin/customer_contracts?customer_id=${cliente.id}`;
        console.log('Listing customer contracts URL:', listUrl);

        const listRes = await fetch(listUrl, { method: 'GET', headers: authHeaders });
        const listText = await listRes.text();
        console.log('Customer contracts list response status:', listRes.status);

        if (listRes.ok) {
          let listJson: any = null;
          try {
            listJson = JSON.parse(listText);
          } catch {
            listJson = null;
          }

          const contratos = listJson?.customer_contracts || listJson?.contracts || listJson?.data || listJson;
          const contrato0 = Array.isArray(contratos) ? contratos[0] : null;
          if (contrato0) {
            await applyContratoData(contrato0, 'GET /customer_contracts?customer_id=');
          } else {
            console.log('No contracts returned on list endpoint');
          }
        } else {
          console.log('Customer contracts list fetch failed:', listText);
        }
      }

      // 2.2) Tentativa extra: alguns painéis exibem contrato por ID, mas nem sempre existe endpoint público
      if ((!planoNome || valorPlano === null || vencimento === null) && contratoId) {
        const contractUrl = `https://api.mikweb.com.br/v1/admin/customer_contracts/${contratoId}`;
        console.log('Fetching customer contract URL:', contractUrl);

        const contractRes = await fetch(contractUrl, { method: 'GET', headers: authHeaders });
        const contractText = await contractRes.text();
        console.log('Customer contract response status:', contractRes.status);

        if (contractRes.ok) {
          let contractJson: any = null;
          try {
            contractJson = JSON.parse(contractText);
          } catch {
            contractJson = null;
          }

          const contrato = contractJson?.customer_contract || contractJson?.contract || contractJson;
          await applyContratoData(contrato, 'GET /customer_contracts/{id}');
        } else {
          console.log('Customer contract fetch failed:', contractText);
        }
      }
    }

    console.log('Final plano_nome:', planoNome);
    console.log('Final valor_plano:', valorPlano);
    console.log('Final vencimento:', vencimento);

    return new Response(
      JSON.stringify({
        success: true,
        cliente: {
          id: cliente.id,
          nome: cliente.full_name,
          cpf_cnpj: cliente.cpf_cnpj,
          email: cliente.email,
          celular: cliente.cell_phone_number_1,
          telefone: cliente.phone_number,
          endereco: cliente.street,
          numero: cliente.number,
          bairro: cliente.neighborhood,
          cidade: cliente.city,
          estado: cliente.state,
          cep: cliente.zip_code,
          status: cliente.status,
          data_cadastro: cliente.customer_since,
          login: cliente.login,
          plano: cliente.plan?.id || cliente.plan_id,
          plano_nome: planoNome,
          valor_plano: valorPlano,
          vencimento: vencimento,
          bloqueado: isBloqueado,
          servidor: cliente.server?.name,
          contrato_id: contratoId || null,
        },
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
