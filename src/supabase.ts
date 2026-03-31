/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';

let supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
let supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const fallbackUrl = 'https://jkizfeozfgjogvhvrppz.supabase.co';
const fallbackKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpraXpmZW96Zmdqb2d2aHZycHB6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5MTA4MDYsImV4cCI6MjA4NzQ4NjgwNn0.KWNY7Y8IyNUwL1bTERoZnKi76kyiXqZJJXg7rZg3nn8';

// Validate URL
try {
  if (supabaseUrl) {
    new URL(supabaseUrl);
  } else {
    supabaseUrl = fallbackUrl;
  }
} catch (e) {
  console.warn('Invalid VITE_SUPABASE_URL, using fallback.');
  supabaseUrl = fallbackUrl;
}

if (!supabaseAnonKey || supabaseAnonKey.trim() === '') {
  supabaseAnonKey = fallbackKey;
}

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials missing. Please check your environment variables.');
}

console.log('Initializing Supabase client with URL:', supabaseUrl);

if (supabaseUrl && supabaseUrl.includes('localhost')) {
  console.error('WARNING: You are trying to connect to a localhost Supabase instance from AI Studio. This will not work because AI Studio runs in a remote container. Please use a remote Supabase URL (e.g., https://xxx.supabase.co).');
}

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey
);
