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
    const { cliente_id, auth_token } = await req.json();

    if (!cliente_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'ID do cliente é obrigatório' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Validar auth_token HMAC (emitido pelo mikweb-auth)
    const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const verifyToken = async (token: string | undefined): Promise<{ ok: boolean; reason?: string }> => {
      if (!token || typeof token !== 'string' || !token.includes('.')) return { ok: false, reason: 'missing' };
      try {
        const [payloadB64, sigB64] = token.split('.');
        const b64urlDecode = (s: string) => {
          const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
          const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
          const bin = atob(b64);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          return bytes;
        };
        const enc = new TextEncoder();
        const payloadBytes = b64urlDecode(payloadB64);
        const sigBytes = b64urlDecode(sigB64);
        const key = await crypto.subtle.importKey(
          'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
        );
        const valid = await crypto.subtle.verify('HMAC', key, sigBytes, payloadBytes);
        if (!valid) return { ok: false, reason: 'invalid_signature' };
        const payload = JSON.parse(new TextDecoder().decode(payloadBytes));
        if (!payload.exp || Date.now() > payload.exp) return { ok: false, reason: 'expired' };
        if (Number(payload.cid) !== Number(cliente_id)) return { ok: false, reason: 'cliente_mismatch' };
        return { ok: true };
      } catch {
        return { ok: false, reason: 'parse_error' };
      }
    };

    const tokenCheck = await verifyToken(auth_token);
    if (!tokenCheck.ok) {
      console.warn(`Token inválido para cliente ${cliente_id}: ${tokenCheck.reason}`);
      return new Response(
        JSON.stringify({ success: false, error: 'Sessão inválida ou expirada. Faça login novamente.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
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

    // 1. Buscar contratos do cliente e identificar o bloqueado
    console.log(`Buscando contratos do cliente ${cliente_id}...`);
    const contractsResp = await fetch(
      `https://api.mikweb.com.br/v1/admin/customer_contracts?customer_id=${cliente_id}`,
      { method: 'GET', headers: authHeaders }
    );

    let contractId: number | null = null;
    let contracts: any[] = [];

    if (contractsResp.ok) {
      const contractsData = await contractsResp.json();
      contracts = contractsData.customer_contracts || contractsData.contracts || contractsData.data || [];
      
      console.log(`Total de contratos encontrados: ${contracts?.length || 0}`);
      
      // Listar todos os contratos para debug
      contracts?.forEach((c: any) => {
        console.log(`  Contrato id=${c.id}, status=${c.status}, access_status=${c.access_status}`);
      });

      // Filtrar apenas contratos bloqueados (ignorar cancelados e ativos com financeiro em dia)
      const blockedStatuses = ['b', 'access_blocked', 'access_pending', 'ca', 'cm'];
      const blockedContract = contracts?.find((c: any) => {
        const accessStatus = (c.access_status || '').toLowerCase();
        const isCancelled = (c.status || '').toLowerCase() === 'cancelled' || (c.status || '').toLowerCase() === 'canceled';
        
        // Ignorar contratos cancelados
        if (isCancelled) {
          console.log(`  Contrato id=${c.id} ignorado: cancelado`);
          return false;
        }
        
        // Selecionar apenas contratos com acesso bloqueado
        const isBlocked = blockedStatuses.includes(accessStatus);
        if (!isBlocked) {
          console.log(`  Contrato id=${c.id} ignorado: acesso liberado (${accessStatus || c.status})`);
        }
        return isBlocked;
      });

      if (blockedContract) {
        contractId = blockedContract.id;
        console.log(`Contrato BLOQUEADO selecionado: id=${contractId}, access_status=${blockedContract.access_status}`);
      } else {
        // Nenhum contrato bloqueado encontrado
        const hasActiveContracts = contracts?.some((c: any) => (c.status || '').toLowerCase() === 'active');
        if (hasActiveContracts) {
          console.log('Nenhum contrato bloqueado encontrado. Todos os contratos ativos estão com acesso liberado.');
        }
      }
    }

    let success = false;
    let unlockedContractId: number | null = contractId;
    let unlockedContractPlan: string | null = null;

    if (contractId) {
      // Guardar info do contrato desbloqueado
      const targetContract = contracts?.find((c: any) => c.id === contractId);
      if (targetContract) {
        unlockedContractPlan = targetContract.name || targetContract.plan_name || targetContract.plan || null;
      }
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

    // 2. Verificar boletos e colocar em observação se necessário
    try {
      console.log(`Buscando boletos do cliente ${cliente_id} (com paginação)...`);

      // Paginar TODAS as páginas para garantir que pegamos o boleto mais recente
      const allBillings: any[] = [];
      const maxPages = 20;
      for (let page = 1; page <= maxPages; page++) {
        const resp = await fetch(
          `https://api.mikweb.com.br/v1/admin/billings?customer_id=${cliente_id}&page=${page}&per_page=100`,
          { method: 'GET', headers: authHeaders }
        );
        if (!resp.ok) {
          console.log(`Billings page ${page}: HTTP ${resp.status}, parando paginação`);
          await resp.text();
          break;
        }
        const data = await resp.json();
        const pageBillings = data.billings || data.data || [];
        console.log(`Billings page ${page}: ${pageBillings.length} registros`);
        if (pageBillings.length === 0) break;
        allBillings.push(...pageBillings);
        if (pageBillings.length < 100) break;
      }
      console.log(`Total de boletos coletados: ${allBillings.length}`);

      // Parser robusto para datas vindas do MikWeb (aceita YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY)
      const parseDueDate = (raw: any): Date | null => {
        if (!raw) return null;
        const s = String(raw).trim();
        const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
        if (iso) return new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]));
        const br = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
        if (br) {
          let y = +br[3]; if (y < 100) y += 2000;
          return new Date(Date.UTC(y, +br[2] - 1, +br[1]));
        }
        const d = new Date(s);
        return isNaN(d.getTime()) ? null : d;
      };

      // Detectar se boleto já está em observação / liberado / pago / cancelado
      const isAlreadyObservedOrPaid = (b: any): boolean => {
        const desc = (b.situation_description || b.situation_name || b.situation?.name || '').toLowerCase();
        if (b.situation_id === 1 || b.situation_id === 4) return true;
        if (desc.includes('observa')) return true;
        if (desc.includes('efetuado') || desc.includes('pago') || desc.includes('liquidado')) return true;
        if (desc.includes('cancel')) return true;
        if (b.value_paid && Number(b.value_paid) > 0) return true;
        if (b.date_payment) return true;
        return false;
      };

      {
        const today = new Date();
        const todayUTC = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));

        // Apenas boletos REALMENTE em atraso: situation_id == 2 ("Em Atraso"),
        // vencidos, NÃO pagos e NÃO já em observação.
        // IMPORTANTE: situation_id 3 = "Efetuado" (pago) — NÃO incluir.
        const overdueBillings = allBillings.filter((b: any) => {
          if (b.situation_id !== 2) return false;
          if (isAlreadyObservedOrPaid(b)) return false;
          const due = parseDueDate(b.due_day || b.vencimento);
          if (!due) return false;
          return due.getTime() < todayUTC.getTime();
        });

        console.log(`Boletos em atraso elegíveis: ${overdueBillings.length}`);
        overdueBillings.forEach((b: any) => {
          console.log(`  Boleto id=${b.id} due=${b.due_day} sit=${b.situation_id}/${b.situation_description || b.situation?.name}`);
        });

        // Pagamento recente já confirmado pelo banco (situation_id 1 ou Efetuado no mês atual)
        const hasRecentPayment = allBillings.some((b: any) => {
          const due = parseDueDate(b.due_day || b.vencimento);
          if (!due) return false;
          const desc = (b.situation_description || b.situation_name || b.situation?.name || '').toLowerCase();
          const isPaid = b.situation_id === 1
            || desc.includes('efetuado') || desc.includes('pago') || desc.includes('liquidado');
          const isCurrentMonth = due.getUTCMonth() === todayUTC.getUTCMonth()
            && due.getUTCFullYear() === todayUTC.getUTCFullYear();
          return isPaid && isCurrentMonth;
        });


        if (hasRecentPayment && overdueBillings.length === 0) {
          console.log('Pagamento já confirmado pelo banco. Não é necessário colocar em observação.');
          if (!success) success = true;
        } else if (overdueBillings.length > 0) {
          // Selecionar o boleto vencido MAIS RECENTE (maior data de vencimento)
          overdueBillings.sort((a: any, b: any) => {
            const da = parseDueDate(a.due_day || a.vencimento)?.getTime() ?? 0;
            const db = parseDueDate(b.due_day || b.vencimento)?.getTime() ?? 0;
            return db - da;
          });
          const latestBilling = overdueBillings[0];
          console.log(`Boleto selecionado para observação: id=${latestBilling.id} due=${latestBilling.due_day}`);

          // Colocar em observação com lock_in = amanhã
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          const dd = String(tomorrow.getDate()).padStart(2, '0');
          const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
          const yyyy = tomorrow.getFullYear();
          const lockIn = `${dd}-${mm}-${yyyy}`;

          try {
            const obsResp = await fetch(
              `https://api.mikweb.com.br/v1/admin/billings/${latestBilling.id}/add_observation`,
              {
                method: 'PUT',
                headers: authHeaders,
                body: JSON.stringify({ lock_in: lockIn }),
              }
            );
            const obsText = await obsResp.text();
            console.log(`PUT /billings/${latestBilling.id}/add_observation (lock_in=${lockIn}): ${obsResp.status} - ${obsText.substring(0, 300)}`);
            if (obsResp.ok && !success) {
              success = true;
            }
          } catch (billingErr) {
            console.error(`Erro ao colocar boleto ${latestBilling.id} em observação:`, billingErr);
          }
        } else {
          console.log('Nenhum boleto vencido elegível encontrado.');
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
        contrato_id: unlockedContractId || null,
        contrato_plano: unlockedContractPlan || null,
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
