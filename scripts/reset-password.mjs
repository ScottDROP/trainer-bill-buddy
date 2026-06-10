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

const supabase = createClient(url, key);

const email = process.argv[2];
if (!email) {
  console.error('Usage: node reset-password.mjs <email>');
  process.exit(1);
}

const { error } = await supabase.auth.resetPasswordForEmail(email, {
  redirectTo: 'http://localhost:8080',
});

if (error) {
  console.error('Reset error:', error.message);
  process.exit(1);
}

console.log(`Password reset email sent to ${email}.`);
console.log('Check your inbox (and spam folder).');
