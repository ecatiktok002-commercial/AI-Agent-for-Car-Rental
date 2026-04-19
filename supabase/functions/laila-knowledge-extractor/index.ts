import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { GoogleGenAI } from "npm:@google/genai";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);
const geminiApiKey = Deno.env.get("GEMINI_API_KEY")!;
const genai = new GoogleGenAI({ apiKey: geminiApiKey });

serve(async (req) => {
  try {
    console.log("🌙 Starting Night Shift Knowledge Extraction...");

    // 1. Fetch recent closed/resolved tickets handled by agents today
    const { data: recentTickets, error: ticketErr } = await supabase
      .from('tickets')
      .select('id')
      .eq('is_closed', true)
      .eq('handled_by', 'agent')
      .order('created_at', { ascending: false })
      .limit(50); // Just process the 50 most recent resolved tickets

    if (ticketErr || !recentTickets?.length) {
      return new Response(JSON.stringify({ status: "No tickets to process" }), { status: 200 });
    }

    const ticketIds = recentTickets.map((t: any) => t.id);

    // 2. Fetch the message history for these tickets
    const { data: messages, error: msgErr } = await supabase
      .from('messages')
      .select('ticket_id, sender_type, message_text')
      .in('ticket_id', ticketIds)
      .order('created_at', { ascending: true });

    if (msgErr || !messages?.length) {
      return new Response(JSON.stringify({ status: "No messages found" }), { status: 200 });
    }

    // Group messages by ticket to create coherent transcripts
    const groupedTranscript: Record<string, string[]> = {};
    for (const msg of messages) {
      if (!groupedTranscript[msg.ticket_id]) groupedTranscript[msg.ticket_id] = [];
      groupedTranscript[msg.ticket_id].push(`${msg.sender_type.toUpperCase()}: ${msg.message_text}`);
    }

    let extractedFactsCount = 0;

    // 3. Process each transcript using Gemini
    for (const ticketId in groupedTranscript) {
      const transcript = groupedTranscript[ticketId].join('\n');
      
      const prompt = `You are Laila's memory processor. Analyze the provided customer-admin chat transcript. 
1. Identify any new business rules, pricing details, or policies stated by the human admin.
2. Extract these into clear, concise standalone facts (e.g., "Fact: Deposit for Axia is RM100").
3. Assign a Category. You may use existing categories OR invent a logical new one (e.g., "Late Fees", "Cross-Border", "Insurance") if the topic is entirely new.
4. Output strictly in JSON format: { "facts": [ { "question": "...", "answer": "...", "category": "..." } ] }\n\nTranscript:\n${transcript}`;

      const response = await genai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          temperature: 0.2,
          responseMimeType: "application/json"
        }
      });

      const aiText = response.text || "";
      if (aiText) {
        try {
          const parsed = JSON.parse(aiText);
          const facts = parsed.facts || [];
          
          for (const fact of facts) {
            // Use company_knowledge to match the existing schema: topic (question), fact (answer)
            const { error: insertErr } = await supabase.from('company_knowledge').insert([{
              topic: fact.question,
              fact: fact.answer,
              category: fact.category,
              is_active: false // Explicitly set to false pending human review
            }]);
            
            if (!insertErr) extractedFactsCount++;
          }
        } catch (e) {
          console.error("Failed to parse Gemini output:", e, aiText);
        }
      }
    }

    return new Response(
      JSON.stringify({ status: "success", extracted: extractedFactsCount }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in knowledge extractor:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});
