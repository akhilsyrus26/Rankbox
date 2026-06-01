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

async function testRLS() {
  console.log("Simulating Malicious Bot Attack...");
  
  // Try to insert a fake profile without being logged in
  console.log("\n1. Attempting unauthorized INSERT into profiles...");
  const { error: insertErr } = await supabase.from('profiles').insert([{ id: '11111111-1111-1111-1111-111111111111', username: 'hacker' }]);
  if (insertErr) {
    console.log("SUCCESS! Database rejected unauthorized INSERT:", insertErr.message);
  } else {
    console.log("FAILURE! Database allowed unauthorized INSERT! RLS is not working.");
  }

  // Try to delete all shows
  console.log("\n2. Attempting unauthorized DELETE of all shows...");
  // A standard bot wipe command: delete everything where id is not null
  const { data: deleteData, error: deleteErr } = await supabase.from('shows').delete().not('id', 'is', null).select();
  
  if (deleteErr) {
    console.log("SUCCESS! Database rejected unauthorized DELETE:", deleteErr.message);
  } else if (deleteData && deleteData.length === 0) {
    console.log("SUCCESS! Database silently blocked the DELETE command (0 rows affected). RLS is active.");
  } else {
    console.log("FAILURE! Database allowed the delete command!");
  }
}

testRLS();
