const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const [key, val] = line.split('=');
  if (key && val) acc[key.trim()] = val.trim();
  return acc;
}, {});

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function check() {
  console.log("Fetching profiles...");
  const { data: profiles, error: pErr } = await supabase.from('profiles').select('*');
  if (pErr) console.error("Profile Error:", pErr);
  
  console.log("PROFILES:");
  profiles.forEach(p => console.log(p.username, p.id));

  console.log("\nFetching shows count per user...");
  const { data: specificShows } = await supabase.from('shows').select('*').eq('user_id', 'a933a70a-1bc9-4c64-a831-c3ebf71fc09b');
  console.log("\nSHOWS SPECIFICALLY FOR Akhilsyrus26 (a933a70a-1bc9-4c64-a831-c3ebf71fc09b):");
  console.log(specificShows);

  const { data: allShows } = await supabase.from('shows').select('*');
  console.log("\nALL SHOWS:");
  if (allShows) {
    allShows.forEach(s => {
      console.log(`Show: ${s.title} | UserID: ${s.user_id}`);
    });
  } else {
    console.log("No shows found at all?!");
  }
}

check();
