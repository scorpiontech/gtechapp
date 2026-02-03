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
    const { cliente_id, conexao_id } = await req.json();

    if (!cliente_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'ID do cliente é obrigatório' }),
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

    // Se não tiver conexao_id, buscar a conexão do cliente
    let targetConexaoId = conexao_id;
    
    if (!targetConexaoId) {
      // Buscar conexões do cliente
      const conexoesResponse = await fetch(`https://api.mikweb.com.br/v1/admin/conexoes?cliente_id=${cliente_id}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (conexoesResponse.ok) {
        const conexoesData = await conexoesResponse.json();
        const conexoes = conexoesData.conexoes || conexoesData.data || conexoesData;
        
        if (Array.isArray(conexoes) && conexoes.length > 0) {
          targetConexaoId = conexoes[0].id;
        }
      }
    }

    if (!targetConexaoId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Conexão não encontrada para este cliente' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    // Realizar o desbloqueio via API MikWeb
    // Endpoint pode variar dependendo da versão da API
    const desbloqueioResponse = await fetch(`https://api.mikweb.com.br/v1/admin/conexoes/${targetConexaoId}/desbloquear`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        motivo: 'Autodesbloqueio via app cliente',
        temporario: true,
      }),
    });

    if (!desbloqueioResponse.ok) {
      const errorText = await desbloqueioResponse.text();
      console.error('MikWeb desbloqueio error:', desbloqueioResponse.status, errorText);
      
      // Tentar endpoint alternativo
      const altResponse = await fetch(`https://api.mikweb.com.br/v1/admin/clientes/${cliente_id}/desbloquear`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          motivo: 'Autodesbloqueio via app cliente',
        }),
      });

      if (!altResponse.ok) {
        return new Response(
          JSON.stringify({ success: false, error: 'Não foi possível realizar o desbloqueio. Entre em contato com o suporte.' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Desbloqueio realizado com sucesso! Aguarde alguns instantes para que a conexão seja restabelecida.' 
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
