import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { customer_id } = await req.json();

    if (!customer_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'ID do cliente é obrigatório' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const apiToken = Deno.env.get('MIKWEB_API_TOKEN');
    if (!apiToken) {
      return new Response(
        JSON.stringify({ success: false, error: 'Configuração do servidor incompleta' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    // Fetch chamados with pagination
    let allChamados: any[] = [];
    let page = 1;
    const perPage = 100;

    while (true) {
      const response = await fetch(
        `https://api.mikweb.com.br/v1/admin/calledies?customer_id=${customer_id}&page=${page}&per_page=${perPage}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        console.error('MikWeb calledies list error:', response.status, 'page:', page);
        return new Response(
          JSON.stringify({ success: false, error: 'Erro ao consultar chamados' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }

      const data = await response.json();
      const pageChamados = data.calledies || data.data || [];
      console.log(`Page ${page}: ${pageChamados.length} chamados`);

      if (!Array.isArray(pageChamados) || pageChamados.length === 0) break;
      allChamados = allChamados.concat(pageChamados);

      if (pageChamados.length < perPage) break;
      page++;
      if (page > 10) break;
    }

    console.log(`Total chamados fetched: ${allChamados.length}`);

    if (allChamados.length > 0) {
      console.log('Chamado fields:', Object.keys(allChamados[0]).join(', '));
      console.log('Sample chamado:', JSON.stringify(allChamados[0]));
    }

    // Status mapping: 0=Novo, 1=Aguardando Cliente, 2=Aguardando Resposta, 4=Finalizado
    const statusMap: Record<string, string> = {
      '0': 'Novo',
      '1': 'Aguardando Cliente',
      '2': 'Aguardando Resposta',
      '4': 'Finalizado',
    };

    const priorityMap: Record<string, string> = {
      'B': 'Baixa',
      'M': 'Média',
      'A': 'Alta',
    };

    const chamados = allChamados.map((c: any) => ({
      id: c.id,
      subject: c.subject || '',
      message: c.message || '',
      status: statusMap[String(c.status)] || String(c.status),
      status_code: String(c.status),
      priority: priorityMap[c.priority] || c.priority || 'Baixa',
      priority_code: c.priority || 'B',
      created_at: c.created_at || null,
      updated_at: c.updated_at || null,
      finalized_in: c.finalized_in || null,
      technical: c.technical?.full_name || c.technical?.name || null,
      called_type: c.called_type?.name || null,
    }));

    // Sort: newest first
    chamados.sort((a: any, b: any) => {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    return new Response(
      JSON.stringify({ success: true, chamados }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error listing chamados:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Erro interno do servidor' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
