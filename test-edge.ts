import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jkizfeozfgjogvhvrppz.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpraXpmZW96Zmdqb2d2aHZycHB6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5MTA4MDYsImV4cCI6MjA4NzQ4NjgwNn0.KWNY7Y8IyNUwL1bTERoZnKi76kyiXqZJJXg7rZg3nn8';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function test() {
  console.log('Testing Edge Function...');
  const { data, error } = await supabase.functions.invoke('whatsapp-agent-core', {
    body: {
      action: 'test-persona',
      message: 'Hello',
      personality_instructions: 'Be nice',
      agent_name: 'TestAgent'
    }
  });

  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Data:', data);
  }
}

test();
