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
    const { customer_id, subject, message, priority } = await req.json();

    if (!customer_id || !subject || !message) {
      return new Response(
        JSON.stringify({ success: false, error: 'Campos obrigatórios: assunto, mensagem e ID do cliente' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Validate subject length
    if (subject.length > 255) {
      return new Response(
        JSON.stringify({ success: false, error: 'Assunto deve ter no máximo 255 caracteres' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Validate priority
    const validPriorities = ['B', 'M', 'A'];
    const selectedPriority = priority && validPriorities.includes(priority) ? priority : 'B';

    const apiToken = Deno.env.get('MIKWEB_API_TOKEN');
    if (!apiToken) {
      return new Response(
        JSON.stringify({ success: false, error: 'Configuração do servidor incompleta' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    console.log(`Creating chamado for customer ${customer_id}: "${subject}" priority=${selectedPriority}`);

    const response = await fetch('https://api.mikweb.com.br/v1/admin/calledies', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        subject,
        message,
        customer_id,
        priority: selectedPriority,
      }),
    });

    const responseText = await response.text();
    console.log('MikWeb calledies response status:', response.status);
    console.log('MikWeb calledies response:', responseText);

    if (!response.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Erro ao abrir chamado. Tente novamente.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      data = null;
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Chamado aberto com sucesso!',
        chamado: data 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Error creating chamado:', err);
    return new Response(
      JSON.stringify({ success: false, error: 'Erro interno do servidor' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
