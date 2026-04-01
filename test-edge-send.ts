import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jkizfeozfgjogvhvrppz.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpraXpmZW96Zmdqb2d2aHZycHB6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5MTA4MDYsImV4cCI6MjA4NzQ4NjgwNn0.KWNY7Y8IyNUwL1bTERoZnKi76kyiXqZJJXg7rZg3nn8';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function test() {
  console.log('Testing send-message...');
  
  // Get a ticket and agent
  const { data: tickets } = await supabase.from('tickets').select('*').limit(1);
  const { data: agents } = await supabase.from('agents').select('*').limit(1);
  
  if (!tickets || !tickets.length || !agents || !agents.length) {
    console.log('No tickets or agents found');
    return;
  }
  
  const response = await fetch(`${supabaseUrl}/functions/v1/whatsapp-agent-core`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseAnonKey}`
    },
    body: JSON.stringify({
      action: 'send-message',
      ticket_id: tickets[0].id,
      message_text: 'Hello from test script',
      agent_id: agents[0].id
    })
  });

  const text = await response.text();
  console.log('Status:', response.status);
  console.log('Response:', text);
}

test();
