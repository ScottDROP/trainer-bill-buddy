import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')];
    })
);

const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  console.error('Missing Supabase URL or key in .env');
  process.exit(1);
}

const supabase = createClient(url, key);

const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.error('Usage: node create-user.mjs <email> <password>');
  process.exit(1);
}

const { data, error } = await supabase.auth.signUp({ email, password });

if (error) {
  console.error('Signup error:', error.message);
  process.exit(1);
}

if (data.user && !data.session) {
  console.log('User created — email confirmation likely required.');
  console.log('User ID:', data.user.id);
  console.log('Email confirmed at:', data.user.email_confirmed_at || 'NOT CONFIRMED');
} else if (data.session) {
  console.log('User created and logged in (no email confirmation needed).');
  console.log('User ID:', data.user.id);
}
