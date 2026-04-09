import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { GoogleGenAI, Type, FunctionDeclaration } from "npm:@google/genai";
import postgres from "https://deno.land/x/postgresjs/mod.js";

// Initialize environment variables
const META_ACCESS_TOKEN = Deno.env.get("META_ACCESS_TOKEN");
const META_PHONE_ID = Deno.env.get("META_PHONE_ID");
const META_VERIFY_TOKEN = Deno.env.get("META_VERIFY_TOKEN") || "ECA_SECURE_Tiktok003_2026";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

// ADD THESE 3 LINES:
const EXT_URL = Deno.env.get("EXTERNAL_SUPABASE_URL");
const EXT_KEY = Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY");
const extSupabase = EXT_URL && EXT_KEY ? createClient(EXT_URL, EXT_KEY) : null;

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
        
        try {
          const response = await generateAIResponse(message, "Test Customer", "Test Phone", personality_instructions, agent_name);
          return new Response(JSON.stringify({ success: true, response }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        } catch (error: any) {
          return new Response(JSON.stringify({ success: false, error: error.message, stack: error.stack }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
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
      // ROUTE M: Test DB Bridge (action: "test-bridge")
      // ------------------------------------------
      if (body.action === "test-bridge") {
        try {
          const externalDbUrl = Deno.env.get("EXTERNAL_DB_URL");
          if (!externalDbUrl) {
            return new Response(JSON.stringify({ 
              success: false, 
              error: "EXTERNAL_DB_URL is not set in Edge Function secrets." 
            }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          
          // Attempt to connect to the external database
          const sql = postgres(externalDbUrl);
          const result = await sql`SELECT NOW() as current_time, current_user as connected_user`;
          await sql.end();
          
          return new Response(JSON.stringify({ 
            success: true, 
            message: "Bridge connection successful!", 
            data: result 
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        } catch (error: any) {
          console.error("❌ Bridge Connection Error:", error);
          return new Response(JSON.stringify({ 
            success: false, 
            error: "Bridge connection failed", 
            details: error.message 
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
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
          let text = message.text?.body;
          const customerName = value?.contacts?.[0]?.profile?.name || "Customer";
          const whatsappMessageId = message.id;

          const ADMIN_PHONE = Deno.env.get("ADMIN_PHONE_NUMBER");

          // --- ADMIN INTERCEPTOR ---
          // If the message is from the Admin and starts with APPROVE
          if (from === ADMIN_PHONE && text && text.toUpperCase().startsWith("APPROVE ")) {
            const customerPhoneToApprove = text.split(" ")[1].trim(); 
            
            // NEW APPROVAL MESSAGE (No longer asks for IC because AI already got it)
            const approvalMsg = "✅ *Booking Confirmed!*\n\nTerima kasih boss! Payment and dokumen semua dah lepas verify. payment ca mintak? Booking awak dah berjaya di-lock. Jumpa masa hari pickup nanti! 🎉";
            await sendWhatsAppMessage(customerPhoneToApprove, approvalMsg);

            await sendWhatsAppMessage(ADMIN_PHONE, `✅ Approval sent to ${customerPhoneToApprove}. Booking is now confirmed.`);
            
            return new Response("EVENT_RECEIVED", { status: 200, headers: corsHeaders });
          }
          
          // If the message is from the Admin and starts with REJECT
          if (from === ADMIN_PHONE && text && text.toUpperCase().startsWith("REJECT ")) {
            const customerPhoneToReject = text.split(" ")[1].trim();
            await sendWhatsAppMessage(customerPhoneToReject, "❌ *Payment Failed*\n\nMaaf boss, admin check payment tak masuk lagi. Boleh try check balik bank history atau resit tak?");
            await sendWhatsAppMessage(ADMIN_PHONE, `❌ Rejection sent to ${customerPhoneToReject}.`);
            return new Response("EVENT_RECEIVED", { status: 200, headers: corsHeaders });
          }
          // -------------------------

          if (!text && message.type !== 'image' && message.type !== 'document') {
            return new Response("EVENT_RECEIVED", { status: 200, headers: corsHeaders });
          }

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

              // Download media if the customer sent an image or document
              if (message.type === 'image' && message.image?.id) {
                const mediaUrl = await processWhatsAppMedia(message.image.id, ticket.id, supabase, META_ACCESS_TOKEN);
                text = mediaUrl ? `[IMAGE_RECEIPT: ${mediaUrl}]` : `[Customer sent an image, but it failed to download]`;
              } else if (message.type === 'document' && message.document?.id) {
                const mediaUrl = await processWhatsAppMedia(message.document.id, ticket.id, supabase, META_ACCESS_TOKEN);
                text = mediaUrl ? `[DOCUMENT_RECEIPT: ${mediaUrl}]` : `[Customer sent a document, but it failed to download]`;
              }
              
              if (!text) return new Response("EVENT_RECEIVED", { status: 200, headers: corsHeaders });

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

                const aiResponse = await generateAIResponse(text, customerName, from, personaInstructions, agentName, history?.reverse().slice(0, -1), referenceSnippets);
                
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
                let finalMessage = aiResponse.replace(/\[NEEDS_AGENT\]/g, '').trim();
                const needsQR = finalMessage.includes('[SEND_QR]');
                finalMessage = finalMessage.replace(/\[SEND_QR\]/g, '').trim();

                console.log(`📤 Sending AI response to ${from} (${finalMessage.length} chars)`);
                await sendWhatsAppMessage(from, finalMessage);

                // If AI decided to send bank details, send the QR image immediately after the text
                if (needsQR) {
                  const qrUrl = "https://tnvhriiyuzjhtdqfufmh.supabase.co/storage/v1/object/public/public-assets/ECA%20RHB%20QR.jpeg";
                  await sendWhatsAppImage(from, qrUrl);
                }
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
      // Return 200 with success: false so the client can read the actual error message
      // instead of getting a generic "Failed to send a request" error from Supabase client
      return new Response(JSON.stringify({ success: false, error: err.message }), { 
        status: 200, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
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
async function generateAIResponse(userInput: string, customerName: string, customerPhone: string, customPersona?: string, agentName?: string, history: any[] = [], referenceSnippets?: string) {
  // Initialize GoogleGenAI
  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY || '' });
  
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
* If the information is not in the knowledge base, politely inform the customer that you need a moment to check or double-check with the team.
* CRITICAL: NEVER mention that you are an AI, a bot, or that you are passing them to a "human agent". You MUST act as a real human staff member at all times.
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

  // 2. Fetch Global System Prompt from Database
  const { data: settings } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'ai_system_prompt')
    .single();

  const globalPrompt = settings?.value || `You are the official Assistant for ECA Group. 
  Your goal is to provide fast, accurate, and concise support.
  
  Guidelines:
  1. Be professional yet approachable.
  2. If you don't know an answer, politely ask the customer to wait while you check on it. Do NOT mention "human specialist" or "human agent".
  3. Use the customer's name to make it personal.
  4. Stay on topic. Do not provide unrequested information.
  
  CRITICAL RULE: You are NOT allowed to confirm car availability based on your own memory. If a customer asks "Axia ada tak?" or "Available ke esok?", you MUST use the get_car_availability tool.
  
  CRITICAL RULE 2: If a customer asks "kereta apa yang ada ya?" or "what cars do you have?", you MUST use the get_all_cars tool to get the list of cars. Do NOT guess the cars.

  Logic Flow:
  If get_car_availability returns available: true, you say: "Ada boss! Axia masih available untuk tarikh tu. Nak I proceed booking ke? 😊"
  If get_car_availability returns available: false, you say: "Alamak boss, Axia dah kena tapau (booked) la untuk tarikh tu. Tapi jap, I check Bezza atau Saga untuk boss nak?" (Then check the tool again for alternatives).
  If get_all_cars returns a list of cars, list them nicely to the customer.
  If the tool fails, say: "Kejap ya boss, line sistem tengah sangkut jap. I check manual jap ya."`;

  let basePrompt = `${knowledgeBaseBlock}
${conversationFlowRule}

${globalPrompt}`;

  if (customPersona) {
    basePrompt += `\n\n--- AGENT PERSONA OVERRIDE ---\n`;
    basePrompt += `CRITICAL INSTRUCTION: You are NO LONGER a generic assistant. You are now acting as the AI First-Responder for ${agentName}. 
* You MUST completely adopt their exact tone, vocabulary, slang, and style.
* IGNORE any previous instructions to be "professional" if it conflicts with this persona.
* Do NOT prefix your response with your name (e.g., do not start with "${agentName}:"). 
* Do not announce yourself as an AI. 

AGENT PERSONALITY GUIDE:
${customPersona}

${referenceSnippets ? `STYLE REFERENCE (Mimic this tone/vocabulary):\n${referenceSnippets}\n` : ''}
Reply to the customer message exactly as ${agentName} would.`;
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

  // Add a final instruction to the basePrompt to ensure completion
  const todayDate = new Date().toISOString().split('T')[0];
  const finalBasePrompt = `${basePrompt}\n\nIMPORTANT: Be concise. Stay on topic. Strictly follow the agent's style.\nToday's date is ${todayDate}. When calling tools that require a date, ALWAYS use YYYY-MM-DD format.\n\nBOOKING WORKFLOW (STRICT):\n1. When a customer agrees to rent a car for specific dates, tell them the total price and ask them to make the payment.\n2. You MUST include the exact text "[SEND_QR]" in your message asking for payment so the system attaches the QR code.\n3. Ask them to upload the payment receipt and their IC/License.\n4. Wait for them to upload the receipt. DO NOT save the booking before the receipt is uploaded.\n5. Once they upload the receipt (image), call the 'submit_booking_for_approval' tool to save the booking and email the Admin.`;

  const getCarAvailabilityDeclaration: FunctionDeclaration = {
    name: "get_car_availability",
    description: "Check if a specific car model is available for a given date.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        car_model: {
          type: Type.STRING,
          description: "The model of the car (e.g., Axia, Bezza, Saga).",
        },
        date: {
          type: Type.STRING,
          description: "The date to check availability for. MUST be strictly in YYYY-MM-DD format. If the user says 'tomorrow', 'esok', or '4/4', you must convert it to the correct YYYY-MM-DD date based on today's date.",
        },
      },
      required: ["car_model", "date"],
    },
  };

  const getAllCarsDeclaration: FunctionDeclaration = {
    name: "get_all_cars",
    description: "Get a list of all car models available for rent in the company fleet.",
  };

  const submitBookingForApprovalDeclaration: FunctionDeclaration = {
    name: "submit_booking_for_approval",
    description: "Submit the booking details and payment receipt for admin approval.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        car_model: { type: Type.STRING, description: "The car model they are booking." },
        area: { type: Type.STRING, description: "Local or Outstation." },
        rental_dates: { type: Type.STRING, description: "The dates they are renting." },
        receipt_url: { type: Type.STRING, description: "The https URL of the receipt image uploaded by the customer." }
      },
      required: ["car_model", "area", "rental_dates", "receipt_url"],
    },
  };

  try {
    if (!GEMINI_API_KEY) {
      console.error("GEMINI_API_KEY is missing!");
      throw new Error("GEMINI_API_KEY is missing");
    }

    // NEW: Helper function to automatically switch models on failure
    const callGeminiWithFallback = async (requestParams: any) => {
      const primaryModel = "gemini-3.1-flash-lite-preview";
      const fallbackModel = "gemini-2.0-flash"; // Reliable, stable production model
      
      try {
        return await ai.models.generateContent({
          ...requestParams,
          model: primaryModel
        });
      } catch (error: any) {
        console.warn(`⚠️ Primary model (${primaryModel}) failed: ${error.message}. Rerouting to fallback (${fallbackModel})...`);
        // If the preview model fails (503), instantly try the stable model
        return await ai.models.generateContent({
          ...requestParams,
          model: fallbackModel
        });
      }
    };

    // 1. First AI Call using the fallback helper
    let response = await callGeminiWithFallback({
      contents: contents,
      config: {
        systemInstruction: finalBasePrompt,
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        tools: [{ functionDeclarations: [getCarAvailabilityDeclaration, getAllCarsDeclaration, submitBookingForApprovalDeclaration] }],
      }
    });

    let loopCount = 0;
    while (response.functionCalls && response.functionCalls.length > 0 && loopCount < 3) {
      loopCount++;
      
      // Append the model's response (which contains the function calls) to contents
      if (response.candidates && response.candidates[0].content) {
        contents.push(response.candidates[0].content);
      }

      const functionResponseParts = [];
      let anyToolCalled = false;

      for (const call of response.functionCalls) {
        let toolResult: any = {};
        let toolCalled = false;

        if (call.name === "get_car_availability") {
          toolCalled = true;
          const args = call.args as any;
          const carModel = args.car_model || '';
          const checkDate = args.date || new Date().toISOString().split('T')[0];

          if (extSupabase) {
            // Call the database function via safe HTTPS API
            const { data, error } = await extSupabase.rpc('check_car_availability', {
              p_model: carModel,
              p_date: checkDate,
              p_subscriber_id: 'be5c97d4-4a83-49dd-8f5d-5616c54c72fd'
            });

            if (error) {
              console.error("RPC Error (Availability):", error.message);
              toolResult = { error: error.message };
            } else {
              toolResult = { available: data === true };
            }
          } else {
            toolResult = { error: "External Supabase keys not configured." };
          }

        } else if (call.name === "get_all_cars") {
          toolCalled = true;
          
          if (extSupabase) {
            // Call the database function via safe HTTPS API
            const { data, error } = await extSupabase.rpc('get_all_car_models', {
              p_subscriber_id: 'be5c97d4-4a83-49dd-8f5d-5616c54c72fd'
            });

            if (error) {
              console.error("RPC Error (All Cars):", error.message);
              toolResult = { error: error.message };
            } else {
              toolResult = { cars: data || [] };
            }
          } else {
            toolResult = { error: "External Supabase keys not configured." };
          }
        } else if (call.name === "submit_booking_for_approval") {
          toolCalled = true;
          const args = call.args as any;
          
          try {
            // 1. Save to the Bookings database so it appears on the Admin Dashboard
            const { error } = await supabase.from('booking_leads').insert([{
              ticket_id: ticket.id,
              customer_phone: customerPhone,
              car_model: args.car_model,
              area: args.area,
              rental_dates: args.rental_dates,
              status: 'pending_verification'
            }]);

            if (error) throw error;
            
            // Update the ticket tag
            await supabase.from('tickets').update({ tag: 'Pending Verification', status: 'waiting_agent' }).eq('id', ticket.id);

            // 2. Send Email Notification to Admin using Resend API
            const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
            const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL") || "your-email@example.com";

            if (RESEND_API_KEY) {
              await fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: {
                  "Authorization": `Bearer ${RESEND_API_KEY}`,
                  "Content-Type": "application/json"
                },
                body: JSON.stringify({
                  from: "Acme Car Rental <onboarding@resend.dev>", // Change Acme Car Rental to your business name
                  to: ADMIN_EMAIL,
                  subject: `🚨 New Booking Approval Needed: ${args.car_model}`,
                  html: `
                    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                      <h2>New Booking Requires Approval</h2>
                      <p><strong>Customer Phone:</strong> ${customerPhone}</p>
                      <p><strong>Car:</strong> ${args.car_model}</p>
                      <p><strong>Dates:</strong> ${args.rental_dates}</p>
                      <p><strong>Area:</strong> ${args.area}</p>
                      <br/>
                      <p><a href="${args.receipt_url}" style="padding: 12px 24px; background: #000; color: #fff; text-decoration: none; border-radius: 6px; font-weight: bold;">View Payment Receipt</a></p>
                      <br/>
                      <p style="color: #666; font-size: 14px;">Please log in to your Helpdesk Dashboard to approve (✅) or reject (❌) this booking.</p>
                    </div>
                  `
                })
              });
            } else {
              console.warn("RESEND_API_KEY not found. Email notification skipped.");
            }

            toolResult = { success: true, message: "Booking submitted successfully. Tell the customer that an admin is verifying their payment and will confirm shortly." };
          } catch (e: any) {
            console.error("Submit Booking Error:", e);
            toolResult = { error: "Failed to submit booking." };
          }
        }

        if (toolCalled) {
          anyToolCalled = true;
          functionResponseParts.push({
            functionResponse: {
              name: call.name,
              response: toolResult,
              id: call.id
            }
          });
        }
      }

      if (anyToolCalled) {
        contents.push({
          role: "user",
          parts: functionResponseParts
        });

        // Call Gemini again with the tool responses using fallback
        response = await callGeminiWithFallback({
          contents: contents,
          config: {
            systemInstruction: finalBasePrompt,
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            tools: [{ functionDeclarations: [getCarAvailabilityDeclaration, getAllCarsDeclaration, submitBookingForApprovalDeclaration] }],
          }
        });
      } else {
        break;
      }
    }

    let aiResponseText = '';
    try {
      aiResponseText = response.text || '';
    } catch (e: any) {
      console.error("Error getting response.text:", e);
      return "Kejap ya, I check dulu... [NEEDS_AGENT]";
    }
    
    if (!aiResponseText) {
       console.error("Gemini API returned no text.");
       return "Kejap ya, I check dulu... [NEEDS_AGENT]";
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
    return "Kejap ya, I check dulu... [NEEDS_AGENT]";
  }
}

async function sendWhatsAppImage(to: string, imageUrl: string) {
  const url = `https://graph.facebook.com/v17.0/${META_PHONE_ID}/messages`;
  await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${META_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: to,
      type: "image",
      image: { link: imageUrl },
    }),
  });
}

// Helper: Download Media from WhatsApp and Upload to Supabase Storage
async function processWhatsAppMedia(mediaId: string, ticketId: string, supabaseClient: any, token: string) {
  try {
    // 1. Get the media URL from Meta
    const metaRes = await fetch(`https://graph.facebook.com/v17.0/${mediaId}`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const metaData = await metaRes.json();
    if (!metaData.url) return null;

    // 2. Download the actual binary file
    const fileRes = await fetch(metaData.url, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const blob = await fileRes.blob();

    // 3. Upload to Supabase Storage (Bucket must be named 'chat_media' and public)
    const fileExt = metaData.mime_type?.split('/')[1] || 'bin';
    const fileName = `${ticketId}/${Date.now()}_${mediaId}.${fileExt}`;
    
    const { error } = await supabaseClient.storage
      .from('chat_media')
      .upload(fileName, blob, {
        contentType: metaData.mime_type,
        upsert: false
      });

    if (error) throw error;

    // 4. Get the Public URL
    const { data: publicUrlData } = supabaseClient.storage.from('chat_media').getPublicUrl(fileName);
    return publicUrlData.publicUrl;
  } catch (e) {
    console.error("Error processing media:", e);
    return null;
  }
} 
