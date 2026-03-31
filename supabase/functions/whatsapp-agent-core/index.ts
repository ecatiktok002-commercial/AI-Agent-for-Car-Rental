import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Initialize environment variables
const META_ACCESS_TOKEN = Deno.env.get("META_ACCESS_TOKEN");
const META_PHONE_ID = Deno.env.get("META_PHONE_ID");
const META_VERIFY_TOKEN = Deno.env.get("META_VERIFY_TOKEN") || "ECA_SECURE_Tiktok003_2026";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
}

serve(async (req) => {
  const url = new URL(req.url);

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // ==========================================
  // 1. GET Request: Meta Webhook Verification
  // ==========================================
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe" && token === META_VERIFY_TOKEN) {
      console.log("Webhook verified successfully!");
      return new Response(challenge, { status: 200, headers: corsHeaders });
    }
    return new Response("Forbidden", { status: 403, headers: corsHeaders });
  }

  // ==========================================
  // 2. POST Request: Unified Router
  // ==========================================
  if (req.method === "POST") {
    try {
      // Validate Environment Variables
      const missingVars = [];
      if (!META_ACCESS_TOKEN) missingVars.push("META_ACCESS_TOKEN");
      if (!META_PHONE_ID) missingVars.push("META_PHONE_ID");
      if (!GEMINI_API_KEY) missingVars.push("GEMINI_API_KEY");
      if (missingVars.length > 0) {
        throw new Error(`Missing environment variables: ${missingVars.join(", ")}`);
      }

      const body = await req.json();
      console.log("📩 Payload Received:", JSON.stringify(body));

      // ------------------------------------------
      // ROUTE A: Dashboard Manual Reply (action: "send-message")
      // ------------------------------------------
      if (body.action === "send-message") {
        const { ticket_id, message_text, agent_id } = body;

        if (!ticket_id || !message_text || !agent_id) {
          throw new Error("Missing ticket_id, message_text, or agent_id");
        }

        // 1. Get Ticket & Customer Details
        const { data: ticket, error: ticketError } = await supabase
          .from("tickets")
          .select("*, customer:customers(*)")
          .eq("id", ticket_id)
          .single();

        if (ticketError) {
          console.error("❌ Ticket Fetch Error:", ticketError);
          throw new Error(`Ticket not found: ${ticketError.message}`);
        }
        if (!ticket) throw new Error("Ticket not found");

        const customerPhone = ticket.customer?.phone_number;
        if (!customerPhone) throw new Error("Customer phone number not found");

        // 2. Get Agent Details (for signature)
        const { data: agent, error: agentError } = await supabase
          .from("agents")
          .select("*")
          .eq("id", agent_id)
          .single();
        
        if (agentError) console.warn("⚠️ Agent not found, sending without signature");

        // 3. Admin Takeover Logic: If Admin sends a message, they take over.
        // Update status to 'assigned' and set assigned_agent_id to Admin's ID.
        if (agent && agent.role === 'admin') {
          const { error: updateError } = await supabase
            .from("tickets")
            .update({ 
              status: "assigned", 
              assigned_agent_id: agent_id,
              handled_by: "agent"
            })
            .eq("id", ticket_id);
          
          if (updateError) console.error("❌ Admin Takeover Update Error:", updateError);
        }

        // 4. Format Message
        let finalMessage = message_text;
        if (agent && agent.signature) {
          finalMessage += `\n\n${agent.signature}`;
        }

        // 5. Send to WhatsApp
        console.log(`📤 Sending Agent Reply to ${customerPhone}`);
        const waResponse = await sendWhatsAppMessage(customerPhone, finalMessage);
        
        if (waResponse.error) {
          console.error("❌ WhatsApp API Error:", JSON.stringify(waResponse.error));
          throw new Error(`WhatsApp API Error: ${waResponse.error.message || "Unknown error"}`);
        }

        // 6. Save to Database
        const { data: message, error: msgError } = await supabase
          .from("messages")
          .insert([{
            ticket_id: ticket_id,
            sender_type: "agent",
            message_text: finalMessage
          }])
          .select()
          .single();

        if (msgError) {
          console.error("❌ Message Insert Error:", msgError);
          throw new Error(`Failed to save message: ${msgError.message}`);
        }

        // 7. Update Ticket's last_message and touch it for real-time updates
        await supabase
          .from("tickets")
          .update({ 
            last_message: finalMessage,
            status: agent && agent.role === 'admin' ? 'assigned' : ticket.status
          })
          .eq("id", ticket_id);

        return new Response(JSON.stringify({ success: true, message }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ------------------------------------------
      // ROUTE D: Admin Manual Assignment (action: "assign-agent")
      // ------------------------------------------
      if (body.action === "assign-agent") {
        const { ticket_id, agent_id } = body;

        if (!ticket_id || !agent_id) {
          throw new Error("Missing ticket_id or agent_id");
        }

        // 1. Get Ticket & Customer Details
        const { data: ticket, error: ticketError } = await supabase
          .from("tickets")
          .select("*, customer:customers(*)")
          .eq("id", ticket_id)
          .single();

        if (ticketError || !ticket) throw new Error("Ticket not found");

        // 2. Update Ticket: Set to 'waiting_agent' and assign to the chosen agent.
        const { error: updateError } = await supabase
          .from("tickets")
          .update({ 
            status: "waiting_agent", 
            assigned_agent_id: agent_id 
          })
          .eq("id", ticket_id);

        if (updateError) throw updateError;

        // 3. Notify Customer
        const notification = "An agent has been assigned to your request. Please wait a moment while they review your case.";
        await sendWhatsAppMessage(ticket.customer.phone_number, notification);

        // 4. Log System Messages
        await supabase.from("messages").insert([
          {
            ticket_id: ticket_id,
            sender_type: "system",
            message_text: `Ticket assigned to agent.`
          },
          {
            ticket_id: ticket_id,
            sender_type: "ai", 
            message_text: notification
          }
        ]);

        // 5. Update Ticket's last_message
        // await supabase
        //   .from("tickets")
        //   .update({ last_message: notification })
        //   .eq("id", ticket_id);

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ------------------------------------------
      // ROUTE E: Agent Take Over (action: "take-over")
      // ------------------------------------------
      if (body.action === "take-over") {
        const { ticket_id, agent_id } = body;

        if (!ticket_id || !agent_id) {
          throw new Error("Missing ticket_id or agent_id");
        }

        // 1. Get Agent Details
        const { data: agent } = await supabase
          .from("agents")
          .select("name")
          .eq("id", agent_id)
          .single();

        // 2. Update Ticket Status to 'assigned'
        await supabase
          .from("tickets")
          .update({ status: "assigned", handled_by: "agent" })
          .eq("id", ticket_id);

        // 3. Log internal message
        const takeoverMsg = `Agent ${agent?.name || 'Unknown'} has taken over the chat.`;
        await supabase.from("messages").insert([{
          ticket_id: ticket_id,
          sender_type: "system",
          message_text: takeoverMsg
        }]);

        // 4. Update Ticket's last_message
        // await supabase
        //   .from("tickets")
        //   .update({ last_message: takeoverMsg })
        //   .eq("id", ticket_id);

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ------------------------------------------
      // ROUTE F: Update Customer (action: "update-customer")
      // ------------------------------------------
      if (body.action === "update-customer") {
        const { customer_id, name } = body;

        if (!customer_id || !name) {
          throw new Error("Missing customer_id or name");
        }

        const { error } = await supabase
          .from("customers")
          .update({ name: name.trim() })
          .eq("id", customer_id);

        if (error) throw error;

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ------------------------------------------
      // ROUTE G: Delete Customer (action: "delete-customer")
      // ------------------------------------------
      if (body.action === "delete-customer") {
        const { customer_id } = body;

        if (!customer_id) {
          throw new Error("Missing customer_id");
        }

        // Supabase foreign keys should handle cascading deletes if configured,
        // but let's be explicit if needed. Assuming cascade is on.
        const { error } = await supabase
          .from("customers")
          .delete()
          .eq("id", customer_id);

        if (error) throw error;

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ------------------------------------------
      // ROUTE H: Delete Ticket (action: "delete-ticket")
      // ------------------------------------------
      if (body.action === "delete-ticket") {
        const { ticket_id } = body;

        if (!ticket_id) {
          throw new Error("Missing ticket_id");
        }

        const { error } = await supabase
          .from("tickets")
          .update({ is_deleted: true, is_closed: true, closed_at: new Date().toISOString() })
          .eq("id", ticket_id);

        if (error) {
          console.error("❌ Ticket Delete Error:", error);
          throw new Error(`Failed to delete ticket: ${error.message}`);
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ------------------------------------------
      // ROUTE I: Add Agent (action: "add-agent")
      // ------------------------------------------
      if (body.action === "add-agent") {
        const { agent_data } = body;

        if (!agent_data || !agent_data.username || !agent_data.name) {
          throw new Error("Missing agent username or name");
        }

        const { active_tickets, ...cleanData } = agent_data;

        const { data, error } = await supabase
          .from("agents")
          .insert([cleanData])
          .select()
          .single();

        if (error) {
          console.error("❌ Add Agent Error:", error);
          throw new Error(`Failed to add agent: ${error.message}`);
        }

        return new Response(JSON.stringify({ success: true, agent: data }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ------------------------------------------
      // ROUTE J: Update Agent (action: "update-agent")
      // ------------------------------------------
      if (body.action === "update-agent" || body.action === "update-agent-persona") {
        const { agent_id, agent_data } = body;

        if (!agent_id || !agent_data) {
          throw new Error("Missing agent_id or agent_data");
        }

        // Ensure we don't accidentally update restricted fields
        const { id, created_at, username, active_tickets, ...cleanData } = agent_data;

        const { data, error } = await supabase
          .from("agents")
          .update(cleanData)
          .eq("id", agent_id)
          .select();

        if (error) {
          console.error("❌ Update Agent Error:", error);
          throw new Error(`Failed to update agent: ${error.message}`);
        }

        if (!data || data.length === 0) {
          throw new Error(`No agent found with ID: ${agent_id}`);
        }

        return new Response(JSON.stringify({ success: true, agent: data[0] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ------------------------------------------
      // ROUTE K: Test Persona (action: "test-persona")
      // ------------------------------------------
      if (body.action === "test-persona") {
        const { message, personality_instructions, agent_name } = body;
        
        const response = await generateAIResponse(message, "Test Customer", personality_instructions, agent_name);
        
        return new Response(JSON.stringify({ success: true, response }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ------------------------------------------
      // ROUTE L: Delete Fact (action: "delete-fact")
      // ------------------------------------------
      if (body.action === "delete-fact") {
        const { fact_id } = body;

        if (!fact_id) {
          throw new Error("Missing fact_id");
        }

        const { error } = await supabase
          .from("company_knowledge")
          .delete()
          .eq("id", fact_id);

        if (error) {
          console.error("❌ Fact Delete Error:", error);
          throw new Error(`Failed to delete fact: ${error.message}`);
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ------------------------------------------
      // ROUTE B: Inbound Customer Webhook
      // ------------------------------------------
      if (body.object === "whatsapp_business_account") {
        const entry = body.entry?.[0];
        const changes = entry?.changes?.[0];
        const value = changes?.value;
        const message = value?.messages?.[0];

        if (message) {
          const from = message.from; // Customer phone number
          const text = message.text?.body;
          const customerName = value?.contacts?.[0]?.profile?.name || "Customer";
          const whatsappMessageId = message.id;

          if (!text) return new Response("EVENT_RECEIVED", { status: 200, headers: corsHeaders });

          // 1. Check if this message ID has already been processed
          const { data: existingMsg } = await supabase
            .from("messages")
            .select("id")
            .eq("whatsapp_message_id", whatsappMessageId)
            .maybeSingle();

          if (existingMsg) {
            console.log(`♻️ Skipping duplicate message: ${whatsappMessageId}`);
            return new Response("EVENT_RECEIVED", { status: 200, headers: corsHeaders });
          }

          // 2. Respond to Meta immediately to prevent retries
          // We'll continue processing in the background
          (async () => {
            try {
              // 1. Customer Lookup/Creation
              let { data: customer } = await supabase
                .from("customers")
                .select("*")
                .eq("phone_number", from)
                .single();

              if (!customer) {
                const { data: newCustomer, error: customerInsertError } = await supabase
                  .from("customers")
                  .insert([{ phone_number: from, name: customerName }])
                  .select()
                  .single();
                
                if (customerInsertError) throw customerInsertError;
                customer = newCustomer;
              }

              // 2. Ticket Logic (Find open ticket)
              let { data: ticket } = await supabase
                .from("tickets")
                .select("*")
                .eq("customer_id", customer.id)
                .eq("is_closed", false)
                .eq("is_deleted", false)
                .order("created_at", { ascending: false })
                .limit(1)
                .single();

              if (!ticket) {
                // 1. Fetch all active agents for round-robin
                const { data: activeAgents } = await supabase
                  .from("agents")
                  .select("id")
                  .eq("status", "online")
                  .order("created_at", { ascending: true });

                let assignedAgentId = null;

                if (activeAgents && activeAgents.length > 0) {
                  // 2. Find the last assigned ticket to determine the next agent
                  const { data: lastTicket } = await supabase
                    .from("tickets")
                    .select("assigned_agent_id")
                    .not("assigned_agent_id", "is", null)
                    .order("created_at", { ascending: false })
                    .limit(1)
                    .single();

                  if (lastTicket && lastTicket.assigned_agent_id) {
                    const lastAgentIndex = activeAgents.findIndex(a => a.id === lastTicket.assigned_agent_id);
                    const nextAgentIndex = lastAgentIndex !== -1 ? (lastAgentIndex + 1) % activeAgents.length : 0;
                    assignedAgentId = activeAgents[nextAgentIndex].id;
                  } else {
                    // If no previous ticket, assign to the first agent
                    assignedAgentId = activeAgents[0].id;
                  }
                }

                // Every new message from a customer must start with status: 'ai_handling'
                const { data: newTicket, error: ticketInsertError } = await supabase
                  .from("tickets")
                  .insert([{ 
                    customer_id: customer.id, 
                    status: "ai_handling",
                    assigned_agent_id: assignedAgentId
                  }])
                  .select()
                  .single();
                
                if (ticketInsertError) throw ticketInsertError;
                ticket = newTicket;
              }

              // 3. Save Inbound Message with WhatsApp ID
              const { data: msgInsertData, error: msgInsertError } = await supabase.from("messages").insert([{
                ticket_id: ticket.id,
                sender_type: "customer",
                message_text: text,
                whatsapp_message_id: whatsappMessageId
              }]).select().single();

              if (msgInsertError) {
                if (msgInsertError.code === '23505') {
                  console.log(`♻️ Duplicate message ID caught during insert: ${whatsappMessageId}`);
                  return;
                }
                throw msgInsertError;
              }

              // Update Ticket's last_message to trigger real-time refresh in dashboard
              await supabase
                .from("tickets")
                .update({ last_message: text })
                .eq("id", ticket.id);

              // --- DEBOUNCE LOGIC START ---
              // Wait for 5 seconds to see if the customer sends more messages
              console.log(`⏳ Waiting 5s for potential follow-up messages from ${from}...`);
              await new Promise(resolve => setTimeout(resolve, 5000));

              // Check if this is still the LATEST message from the customer
              const { data: latestMsg } = await supabase
                .from("messages")
                .select("id")
                .eq("ticket_id", ticket.id)
                .eq("sender_type", "customer")
                .order("created_at", { ascending: false })
                .limit(1)
                .single();

              if (latestMsg && latestMsg.id !== msgInsertData.id) {
                console.log(`⏭️ Newer message detected for ticket ${ticket.id}. This instance will exit.`);
                return;
              }

              // Re-fetch ticket to check for status changes (e.g., agent takeover during the wait)
              const { data: freshTicket } = await supabase
                .from("tickets")
                .select("status, assigned_agent_id, handled_by")
                .eq("id", ticket.id)
                .single();
              
              if (!freshTicket || (freshTicket.status !== "ai_handling" && freshTicket.status !== "waiting_agent")) {
                console.log(`🛑 Ticket status changed to ${freshTicket?.status}. AI response cancelled.`);
                return;
              }

              if (freshTicket.handled_by === 'agent') {
                console.log(`🛑 Ticket handled_by is agent. AI response cancelled.`);
                return new Response('Ignored - Agent handling', { status: 200, headers: corsHeaders });
              }
              // --- DEBOUNCE LOGIC END ---

              // 4. AI Logic
              if (freshTicket.status === "ai_handling" || freshTicket.status === "waiting_agent") {
                let personaInstructions = null;
                let agentName = "AI Assistant";
                let referenceSnippets = null;

                // If ticket is assigned or waiting, try to get the agent's persona
                if (freshTicket.assigned_agent_id) {
                  const { data: agent } = await supabase
                    .from("agents")
                    .select("name, personality_instructions, training_notes, ai_mirroring_enabled")
                    .eq("id", freshTicket.assigned_agent_id)
                    .single();
                  
                  if (agent?.ai_mirroring_enabled && agent?.personality_instructions) {
                    personaInstructions = agent.personality_instructions;
                    agentName = agent.name;
                    referenceSnippets = agent.training_notes;
                  }
                }

                // Fetch last 10 messages for context
                const { data: history } = await supabase
                  .from("messages")
                  .select("sender_type, message_text, created_at")
                  .eq("ticket_id", ticket.id)
                  .order("created_at", { ascending: false })
                  .limit(10);

                // Fetch handoff keywords from settings
                const { data: keywordSettings } = await supabase
                  .from('system_settings')
                  .select('value')
                  .eq('key', 'ai_handoff_keywords')
                  .single();
                
                const customKeywords = keywordSettings?.value 
                  ? keywordSettings.value.split(',').map((k: string) => k.trim().toLowerCase()).filter((k: string) => k.length > 0)
                  : [];

                const aiResponse = await generateAIResponse(text, customerName, personaInstructions, agentName, history?.reverse().slice(0, -1), referenceSnippets);
                
                // Check for handover intent or AI-triggered escalation
                const defaultKeywords = ["human", "agent", "person", "staff", "speak to someone", "talk to someone", "orang", "staf", "admin", "bantuan"];
                const allKeywords = [...new Set([...defaultKeywords, ...customKeywords])];
                
                const needsHandover = allKeywords.some(keyword => text.toLowerCase().includes(keyword)) || aiResponse.includes("[NEEDS_AGENT]");

                if (needsHandover && freshTicket.status === "ai_handling") {
                  await supabase
                    .from("tickets")
                    .update({ status: "waiting_agent" })
                    .eq("id", ticket.id);
                  
                  const systemMsg = aiResponse.includes("[NEEDS_AGENT]") 
                    ? "AI triggered escalation protocol. Ticket moved to 'Waiting Agent'."
                    : "AI detected handover request. Ticket moved to 'Waiting Agent'.";

                  await supabase.from("messages").insert([{
                    ticket_id: ticket.id,
                    sender_type: "system",
                    message_text: systemMsg
                  }]);
                }

                await supabase.from("messages").insert([{
                  ticket_id: ticket.id,
                  sender_type: "ai",
                  message_text: aiResponse
                }]);

                // Update Ticket's last_message for AI response
                await supabase
                  .from("tickets")
                  .update({ last_message: aiResponse })
                  .eq("id", ticket.id);

                console.log(`🤖 Raw AI Response: ${aiResponse}`);
                
                // Clean the message before it hits WhatsApp
                const finalMessage = aiResponse.replace(/\[NEEDS_AGENT\]/g, '').trim();
                console.log(`📤 Sending AI response to ${from} (${finalMessage.length} chars)`);
                await sendWhatsAppMessage(from, finalMessage);
              }
            } catch (err) {
              console.error("❌ Background Processing Error:", err);
            }
          })();

          return new Response("EVENT_RECEIVED", { status: 200, headers: corsHeaders });
        }
        
        // Always return 200 for WhatsApp events to prevent Meta from retrying/disabling the webhook
        return new Response("EVENT_RECEIVED", { status: 200, headers: corsHeaders });
      }
      
      // ------------------------------------------
      // ROUTE C: Agent Management (Legacy/Optional)
      // ------------------------------------------
      // If needed, we can add 'action: "add-agent"' here.

      return new Response("Unknown Action or Event", { status: 400, headers: corsHeaders });

    } catch (err: any) {
      console.error("❌ Error:", err.message);
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
    }
  }

  return new Response("Not Found", { status: 404, headers: corsHeaders });
});

// Helper: Send WhatsApp Message
async function sendWhatsAppMessage(to: string, text: string) {
  const url = `https://graph.facebook.com/v17.0/${META_PHONE_ID}/messages`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${META_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: to,
      type: "text",
      text: { body: text },
    }),
  });
  return response.json();
}

// Helper: Generate AI Response using Gemini
async function generateAIResponse(userInput: string, customerName: string, customPersona?: string, agentName?: string, history: any[] = [], referenceSnippets?: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${GEMINI_API_KEY}`;
  
  // 1. Fetch Company Knowledge Base Facts (RAG)
  const { data: facts } = await supabase
    .from('company_knowledge')
    .select('category, topic, fact')
    .eq('is_active', true);

  const formattedFacts = facts && facts.length > 0 
    ? facts.map(f => `[${f.category} - ${f.topic}]: ${f.fact}`).join('\n')
    : "No specific company facts available.";

  const knowledgeBaseBlock = `COMPANY KNOWLEDGE BASE: You must strictly adhere to the following company facts. 
* If a customer asks a question related to these topics, use this information as your ONLY source of truth.
* Do not invent policies, prices, or services not listed here.
* If the information is not in the knowledge base, politely inform the customer that you'll check with a human agent.
${formattedFacts}`;

  const isFirstMessage = !history || history.length === 0;
  const greetingRule = isFirstMessage 
    ? "* This is the FIRST message. Start with a warm greeting (e.g., 'Hii!', 'Salam', 'hi awak!')."
    : "* This is an ONGOING conversation. DO NOT greet the customer again. Jump straight to the answer.";

  const conversationFlowRule = `
CONVERSATION RULES (STRICT):
${greetingRule}
* BE CONCISE. WhatsApp users prefer short, direct messages.
* ONLY answer what the customer asked. Do not provide extra information or "fun facts" unless directly relevant.
* If providing a list (like prices), keep it brief and well-formatted.
* Never repeat greetings in the middle of a chat.
`;

  let basePrompt = "";
  
  if (customPersona) {
    basePrompt = `${knowledgeBaseBlock}
${conversationFlowRule}

You are the AI First-Responder for ${agentName}. 
* You MUST reply using their exact tone, vocabulary, and style.
* Do NOT prefix your response with your name (e.g., do not start with "${agentName}:"). 
* Do not announce yourself as an AI. 

AGENT PERSONALITY GUIDE:
${customPersona}

${referenceSnippets ? `STYLE REFERENCE (Mimic this tone/vocabulary):\n${referenceSnippets}\n` : ''}
Reply to the customer message as if you are ${agentName}.`;
  } else {
    // 2. Fetch Global System Prompt from Database
    const { data: settings } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'ai_system_prompt')
      .single();

    const globalPrompt = settings?.value || `You are the official AI Assistant for ECA Group. 
    Your goal is to provide fast, accurate, and concise support.
    
    Guidelines:
    1. Be professional yet approachable.
    2. If you don't know an answer, politely ask the customer to wait while you connect them to a human specialist.
    3. Use the customer's name to make it personal.
    4. Stay on topic. Do not provide unrequested information.`;

    basePrompt = `${knowledgeBaseBlock}
${conversationFlowRule}

${globalPrompt}`;
  }

  // Format history for Gemini contents array
  const rawContents: { role: string, text: string }[] = [];
  
  // Add history messages
  if (history && history.length > 0) {
    for (const msg of history) {
      if (msg.sender_type === 'system') continue;
      const text = msg.message_text || "";
      if (!text.trim()) continue;
      const role = msg.sender_type === 'customer' ? 'user' : 'model';
      rawContents.push({ role, text: text.trim() });
    }
  }

  // Add the current user input
  if (userInput && userInput.trim()) {
    rawContents.push({ role: 'user', text: userInput.trim() });
  }

  // Merge consecutive roles and ensure first role is 'user'
  const contents: any[] = [];
  for (const msg of rawContents) {
    if (contents.length === 0) {
      if (msg.role === 'user') {
        contents.push({ role: msg.role, parts: [{ text: msg.text }] });
      }
      // Skip leading 'model' messages to satisfy Gemini API requirements
    } else {
      if (contents[contents.length - 1].role === msg.role) {
        contents[contents.length - 1].parts[0].text += `\n\n${msg.text}`;
      } else {
        contents.push({ role: msg.role, parts: [{ text: msg.text }] });
      }
    }
  }

  if (contents.length === 0) {
    // Fallback if somehow contents is empty
    contents.push({ role: 'user', parts: [{ text: "Hello" }] });
  }

  const payload = {
    systemInstruction: {
      parts: [{ text: basePrompt }]
    },
    contents: contents,
    generationConfig: {
      temperature: 0.7,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 1024,
    }
  };

  // Add a final instruction to the basePrompt to ensure completion
  const finalBasePrompt = `${basePrompt}\n\nIMPORTANT: Be concise. Stay on topic. Strictly follow the agent's style.`;

  payload.systemInstruction.parts[0].text = finalBasePrompt;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    const finishReason = data.candidates?.[0]?.finishReason;
    console.log(`🤖 Gemini Finish Reason: ${finishReason}`);
    
    if (finishReason === 'MAX_TOKENS') {
      console.warn("⚠️ AI response was truncated due to MAX_TOKENS limit.");
    }
    
    if (!response.ok) {
      console.error("Gemini API Error Response:", JSON.stringify(data));
      return "Maaf ya, sistem saya tengah sibuk sikit sekarang. Kejap saya pass pada agent kami untuk bantu you... [NEEDS_AGENT]";
    }

    let aiResponseText = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') || '';
    if (!aiResponseText) {
       console.error("Gemini API returned no text. Full response:", JSON.stringify(data));
       return "Maaf ya, sistem saya tengah sibuk sikit sekarang. Kejap saya pass pada agent kami untuk bantu you... [NEEDS_AGENT]";
    }
    
    // Post-processing: Remove name prefix if present (e.g., "Biha: Hello", "**Biha:** Hello" -> "Hello")
    if (agentName) {
      const prefixRegex = new RegExp(`^\\*?\\*?${agentName}\\*?\\*?\\s*:\\s*`, 'i');
      aiResponseText = aiResponseText.replace(prefixRegex, '').trim();
    }
    aiResponseText = aiResponseText.replace(/^\*?\*?Assistant\*?\*?\s*:\s*/i, '').trim();

    return aiResponseText;
  } catch (error: any) {
    console.error("Gemini Fetch Error:", error);
    return "Maaf ya, sistem saya tengah sibuk sikit sekarang. Kejap saya pass pada agent kami untuk bantu you... [NEEDS_AGENT]";
  }
}
