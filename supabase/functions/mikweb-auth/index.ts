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
            access_status: cliente.access_status || cliente.financial_status || null,
            servidor: cliente.server?.name,
            contrato_id: cliente.customer_contract_ids?.[0] || null,
            // Nota: neste fallback (sem detalhe do contrato), access_status vem do customer
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
    console.log('Observation:', cliente.observation);
    console.log('Additional observation:', cliente.additional_observation);
    console.log('Customer group:', cliente.customer_group ? JSON.stringify(cliente.customer_group) : 'null');
    console.log('Server:', cliente.server ? JSON.stringify(cliente.server) : 'null');
    console.log('Customer contracts:', cliente.customer_contracts ? JSON.stringify(cliente.customer_contracts) : 'null');
    console.log('Contract template_id:', cliente.contract_template_id);
    console.log('Default contract_template_id:', cliente.default_contract_template_id);
    console.log('msg_payment_mk:', cliente.msg_payment_mk);
    console.log('Name field:', cliente.name);
    console.log('Uses contract structure:', cliente.uses_contract_structure);

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
    console.log('Customer plan_id:', cliente.plan_id);

    // 1.1) Se cliente tem plan_id mas não veio o objeto plan, buscar o plano diretamente
    if (!planoNome && cliente.plan_id) {
      const planUrl = `https://api.mikweb.com.br/v1/admin/plans/${cliente.plan_id}`;
      console.log('Fetching plan from customer plan_id:', planUrl);
      
      const planRes = await fetch(planUrl, { method: 'GET', headers: authHeaders });
      if (planRes.ok) {
        const planJson: any = await planRes.json();
        const plan = planJson?.plan || planJson;
        console.log('Plan fields:', plan ? Object.keys(plan).join(', ') : 'null');
        planoNome = plan?.name ?? null;
        valorPlano = valorPlano ?? toNumberOrNull(plan?.value);
        console.log('Plan name from API:', planoNome);
      } else {
        console.log('Plan fetch failed:', planRes.status);
      }
    }

    // 1.2) Tentar extrair nome do plano dos campos de observação (campo personalizado)
    // O provedor pode usar formato: "Plano: 100 Mega" ou "[PLANO] 100 Mega" ou apenas o nome do plano
    if (!planoNome) {
      const obs = cliente.observation?.trim() || '';
      const addObs = cliente.additional_observation?.trim() || '';
      console.log('Customer observation:', obs || '(empty)');
      console.log('Customer additional_observation:', addObs || '(empty)');
      
      // Tentar extrair plano do campo observation ou additional_observation
      const extractPlanFromText = (text: string): string | null => {
        if (!text) return null;
        
        // Padrões comuns: "Plano: X", "[PLANO] X", "PLANO X", ou apenas uma linha curta
        const patterns = [
          /plano[:\s]+(.+)/i,
          /\[plano\]\s*(.+)/i,
          /internet[:\s]+(.+)/i,
          /velocidade[:\s]+(.+)/i,
        ];
        
        for (const pattern of patterns) {
          const match = text.match(pattern);
          if (match && match[1]) {
            return match[1].trim();
          }
        }
        
        // Se o texto for curto (< 50 chars) e parecer um nome de plano, usar diretamente
        if (text.length < 50 && /\d+\s*(mega|mb|gb)/i.test(text)) {
          return text;
        }
        
        return null;
      };
      
      planoNome = extractPlanFromText(obs) || extractPlanFromText(addObs);
      if (planoNome) {
        console.log('Plan name extracted from observation:', planoNome);
      }
    }

    // 2) Se ainda estiver faltando, tentar buscar pelo contrato (customer_contracts / customer_contract_ids)
    const contratoId = Array.isArray(cliente.customer_contract_ids) ? cliente.customer_contract_ids[0] : null;
    const contratoFromCustomer = Array.isArray(cliente.customer_contracts) ? cliente.customer_contracts[0] : null;

    let contractAccessStatus: string | null = null;

    const applyContratoData = async (contrato: any, source: string) => {
      if (!contrato) return;
      console.log(`Applying contract data from ${source}`);

      // Capturar access_status do contrato (prioridade sobre o do cliente)
      if (!contractAccessStatus && contrato.access_status) {
        contractAccessStatus = contrato.access_status;
        console.log('contract.access_status =', contractAccessStatus);
      }
      console.log('Contract fields:', Object.keys(contrato).join(', '));
      console.log('Contract name:', contrato.name);
      console.log('Contract description:', contrato.description);
      console.log('Contract plan:', contrato.plan ? JSON.stringify(contrato.plan) : 'null');
      console.log('Contract plan_id:', contrato.plan_id);
      console.log('Contract integration_id:', contrato.integration_id);
      console.log('Contract customer:', contrato.customer ? 'present' : 'null');
      // Dump all string/number values to find plan name
      for (const [k, v] of Object.entries(contrato)) {
        if (typeof v === 'string' || typeof v === 'number') {
          console.log(`  contract.${k} =`, v);
        }
      }

      // Extrair valor e vencimento do contrato
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
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
          const d = new Date(s + 'T00:00:00Z');
          return Number.isFinite(d.getTime()) ? d.getUTCDate() : null;
        }
        return toNumberOrNull(s);
      })();

      vencimento = vencimento ?? toNumberOrNull(contrato.due_day ?? contrato.due_day_number ?? contrato.due_day_id) ?? dueFromRepeatOn;

      // 1) Tentar nome do plano diretamente do contrato (campos plan.name ou description do contrato)
      // O campo 'name' do contrato geralmente é "Contrato do Cliente ID X", então preferimos 'description'
      // ou usar o nome do plano vinculado
      const contratoDescription = contrato.description?.trim();
      // Usar contract.name como nome do plano (prioridade)
      if (!planoNome && contrato.name) {
        planoNome = contrato.name;
        console.log('Using contract.name as plan name:', planoNome);
      }
      planoNome = planoNome ?? contrato.plan?.name ?? contrato.plan_name ?? contrato.plan?.title ?? null;
      
      // Se description não está vazio e parece ser o nome do plano, usar
      if (!planoNome && contratoDescription && contratoDescription.length > 0 && contratoDescription.length < 100) {
        planoNome = contratoDescription;
        console.log('Using contract description as plan name:', planoNome);
      }

      // 2) Buscar itens do contrato para obter o plano de internet real (PRIORITÁRIO)
      const cId = contrato.id;
      if (!planoNome && cId) {
        const itemsUrl = `https://api.mikweb.com.br/v1/admin/customer_contract_items?customer_contract_id=${cId}`;
        console.log('Fetching contract items URL:', itemsUrl);

        const itemsRes = await fetch(itemsUrl, { method: 'GET', headers: authHeaders });
        console.log('Contract items response status:', itemsRes.status);
        
        if (itemsRes.ok) {
          const itemsJson: any = await itemsRes.json();
          const items = itemsJson?.customer_contract_items || itemsJson?.items || itemsJson?.data || [];
          console.log('Contract items count:', Array.isArray(items) ? items.length : 0);
          
          if (Array.isArray(items) && items.length > 0) {
            for (const item of items) {
              console.log('Item fields:', Object.keys(item).join(', '));
              
              const itemPlanName = item.plan?.name || item.plan_name || item.name || item.description || item.title;
              const itemPlanId = item.plan_id || item.plan?.id;
              
              if (itemPlanName && !planoNome) {
                planoNome = itemPlanName;
                console.log('Plan name from contract item:', planoNome);
              }
              
              if (!planoNome && itemPlanId) {
                const planUrl = `https://api.mikweb.com.br/v1/admin/plans/${itemPlanId}`;
                console.log('Fetching plan from item plan_id:', planUrl);
                
                const planRes = await fetch(planUrl, { method: 'GET', headers: authHeaders });
                if (planRes.ok) {
                  const planJson: any = await planRes.json();
                  const plan = planJson?.plan || planJson;
                  planoNome = plan?.name ?? null;
                  console.log('Plan name from plans API:', planoNome);
                  if (valorPlano === null) {
                    valorPlano = toNumberOrNull(plan?.value);
                  }
                }
              }
              
              if (planoNome) break;
            }
          }
        } else {
          console.log('Contract items fetch failed');
        }
      }

      // 3) Fallback: buscar pelo plan_id do contrato
      const planId = contrato.plan_id ?? contrato.plan?.id;
      if (!planoNome && planId) {
        const planUrl = `https://api.mikweb.com.br/v1/admin/plans/${planId}`;
        console.log('Fetching plan from contract plan_id URL:', planUrl);

        const planRes = await fetch(planUrl, { method: 'GET', headers: authHeaders });
        if (planRes.ok) {
          const planJson: any = await planRes.json();
          const plan = planJson?.plan || planJson;
          planoNome = plan?.name ?? null;
          valorPlano = valorPlano ?? toNumberOrNull(plan?.value);
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

    // Buscar nome do plano via billings e conexões (fora do applyContratoData para ter acesso a cliente.id)
    if (!planoNome && cliente.id) {
      // Billings - cobranças podem ter descrição do plano
      const billingsUrl = `https://api.mikweb.com.br/v1/admin/billings?customer_id=${cliente.id}&per_page=1`;
      console.log('Fetching billings for plan name:', billingsUrl);
      const billingsRes = await fetch(billingsUrl, { method: 'GET', headers: authHeaders });
      if (billingsRes.ok) {
        const billingsJson: any = await billingsRes.json();
        const billings = billingsJson?.billings || billingsJson?.data || [];
        if (Array.isArray(billings) && billings.length > 0) {
          const billing = billings[0];
          console.log('Billing fields:', Object.keys(billing).join(', '));
          for (const [k, v] of Object.entries(billing)) {
            if (typeof v === 'string' && v.length > 0 && v.length < 200) {
              console.log(`  billing.${k} =`, v);
            }
          }
          const items = billing.billing_items || billing.items || [];
          if (Array.isArray(items)) {
            for (const item of items) {
              console.log('Billing item:', JSON.stringify(item));
              const itemName = item.description || item.name || item.plan_name || item.title;
              if (itemName && !/contrato do cliente/i.test(itemName)) {
                planoNome = itemName;
                console.log('Plan name from billing item:', planoNome);
                break;
              }
            }
          }
        }
      } else {
        console.log('Billings fetch failed:', billingsRes.status);
      }
    }

    if (!planoNome && cliente.id) {
      // Conexões do cliente
      const connUrl = `https://api.mikweb.com.br/v1/admin/connections?customer_id=${cliente.id}`;
      console.log('Fetching connections for plan name:', connUrl);
      const connRes = await fetch(connUrl, { method: 'GET', headers: authHeaders });
      if (connRes.ok) {
        const connJson: any = await connRes.json();
        const connections = connJson?.connections || connJson?.data || [];
        if (Array.isArray(connections) && connections.length > 0) {
          const conn = connections[0];
          console.log('Connection fields:', Object.keys(conn).join(', '));
          for (const [k, v] of Object.entries(conn)) {
            if ((typeof v === 'string' || typeof v === 'number') && String(v).length < 200) {
              console.log(`  connection.${k} =`, v);
            }
          }
          const connPlan = conn.plan?.name || conn.plan_name;
          if (connPlan) {
            planoNome = connPlan;
            console.log('Plan name from connection:', planoNome);
          }
        }
      } else {
        console.log('Connections fetch failed:', connRes.status);
      }
    }

    // Último fallback: template do contrato
    if (!planoNome) {
      const templateId = cliente.contract_template_id || cliente.default_contract_template_id;
      if (templateId) {
        const templateUrl = `https://api.mikweb.com.br/v1/admin/contract_templates/${templateId}`;
        console.log('Fetching contract template URL (last fallback):', templateUrl);
        const templateRes = await fetch(templateUrl, { method: 'GET', headers: authHeaders });
        if (templateRes.ok) {
          const templateJson: any = await templateRes.json();
          const template = templateJson?.contract_template || templateJson?.template || templateJson;
          planoNome = template?.name ?? template?.title ?? null;
          console.log('Template name (fallback):', planoNome);
        }
      }
    }

    // ===== Coletar TODOS os contratos do cliente =====
    const allContratos: any[] = [];
    
    if (cliente.id) {
      const allContratosUrl = `https://api.mikweb.com.br/v1/admin/customer_contracts?customer_id=${cliente.id}`;
      console.log('Fetching ALL contracts for customer:', allContratosUrl);
      
      const allContratosRes = await fetch(allContratosUrl, { method: 'GET', headers: authHeaders });
      if (allContratosRes.ok) {
        const allContratosJson: any = await allContratosRes.json();
        const contratosRaw = allContratosJson?.customer_contracts || allContratosJson?.contracts || allContratosJson?.data || [];
        
        if (Array.isArray(contratosRaw)) {
          for (const c of contratosRaw) {
            console.log('Contract raw fields:', Object.keys(c).join(', '));
            console.log('Contract plan object:', c.plan ? JSON.stringify(c.plan) : 'null');
            allContratos.push({
              id: c.id,
              plano_nome: c.plan?.name || c.name || c.description || null,
              valor: toNumberOrNull(c.plan?.value ?? c.total ?? c.subtotal ?? c.value ?? c.monthly_value),
              vencimento: toNumberOrNull(c.due_day ?? c.repeat_on),
              status: c.access_status || c.status || null,
              data_inicio: c.start_date || c.created_at || null,
              data_fim: c.end_date || null,
              velocidade_download: c.plan?.download_speed || c.download_speed || c.plan?.download || null,
              velocidade_upload: c.plan?.upload_speed || c.upload_speed || c.plan?.upload || null,
            });
          }
        }
      }
    }
    
    if (allContratos.length === 0 && Array.isArray(cliente.customer_contract_ids)) {
      for (const cid of cliente.customer_contract_ids) {
        const cUrl = `https://api.mikweb.com.br/v1/admin/customer_contracts/${cid}`;
        const cRes = await fetch(cUrl, { method: 'GET', headers: authHeaders });
        if (cRes.ok) {
          const cJson: any = await cRes.json();
          const c = cJson?.customer_contract || cJson;
          allContratos.push({
            id: c.id,
            plano_nome: c.plan?.name || c.name || c.description || null,
            valor: toNumberOrNull(c.plan?.value ?? c.total ?? c.subtotal ?? c.value ?? c.monthly_value),
            vencimento: toNumberOrNull(c.due_day ?? c.repeat_on),
            status: c.access_status || c.status || null,
            data_inicio: c.start_date || c.created_at || null,
            data_fim: c.end_date || null,
            velocidade_download: c.plan?.download_speed || c.download_speed || c.plan?.download || null,
            velocidade_upload: c.plan?.upload_speed || c.upload_speed || c.plan?.upload || null,
          });
        }
      }
    }
    
    console.log('Total contracts found:', allContratos.length);

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
          access_status: contractAccessStatus || cliente.access_status || cliente.financial_status || null,
          servidor: cliente.server?.name,
          contrato_id: contratoId || null,
          contratos: allContratos,
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
