const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const [key, val] = line.split('=');
  if (key && val) acc[key.trim()] = val.trim();
  return acc;
}, {});

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function testSearch() {
  const socialSearch = 'dbhacker99';
  console.log(`Searching for: ${socialSearch}`);
  const { data, error } = await supabase.from('profiles').select('*').ilike('username', `%${socialSearch}%`);
  console.log("Data:", data);
  console.log("Error:", error);
}

testSearch();
