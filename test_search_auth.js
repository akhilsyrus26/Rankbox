const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const [key, val] = line.split('=');
  if (key && val) acc[key.trim()] = val.trim();
  return acc;
}, {});

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function testSearchWithLogin() {
  // 1. Log in as Akhilsyrus26
  console.log("Logging in...");
  const pseudoEmail = `akhilsyrus26@rankboxapp.com`;
  // I don't know the password, let's just assume "password" or we can't test this way?
  // Wait, I can't login without the password.
  // Let me register a temporary account and test with it!
  const tmpEmail = `tmptestuser@rankboxapp.com`;
  const { data: authData, error: authErr } = await supabase.auth.signUp({ email: tmpEmail, password: 'password123' });
  if (authErr && authErr.message !== 'User already registered') {
     console.error("Signup failed", authErr);
  }
  
  if (authData.user) {
     console.log("Logged in with user:", authData.user.id);
  } else {
     const { data: loginData } = await supabase.auth.signInWithPassword({ email: tmpEmail, password: 'password123' });
     console.log("Logged in with user:", loginData.user.id);
  }

  const socialSearch = 'dbhacker99';
  console.log(`Searching for: ${socialSearch}`);
  const { data, error } = await supabase.from('profiles').select('*').ilike('username', `%${socialSearch}%`);
  console.log("Data:", data);
  console.log("Error:", error);
}

testSearchWithLogin();
