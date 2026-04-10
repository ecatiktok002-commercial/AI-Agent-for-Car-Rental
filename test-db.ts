import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://tnvhriiyuzjhtdqfufmh.supabase.co";
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_ANON_KEY) {
  console.error("No ANON KEY");
} else {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  async function test() {
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(5);
    
    if (error) {
      console.error("Error:", error);
    } else {
      console.log("Messages:", data);
    }
  }

  test();
}
