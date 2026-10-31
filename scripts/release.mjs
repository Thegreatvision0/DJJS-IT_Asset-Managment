/* One command to publish everywhere:  npm run release -- "what changed"
   1. builds the client (the office server serves the new build immediately)
   2. commits all changes and pushes to GitHub (Vercel deploys automatically from GitHub) */
import { execSync } from 'node:child_process';

const run = (cmd, opts = {}) => execSync(cmd, { stdio: 'inherit', ...opts });
const out = cmd => execSync(cmd, { encoding: 'utf8' }).trim();
const msg = process.argv.slice(2).join(' ').trim() || `Update ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;

console.log('\n▶ Building the app…');
run('npm run build --prefix client');

run('git add -A');
const staged = out('git diff --cached --name-only').split('\n').filter(Boolean);
const secret = staged.filter(f => /(^|\/)\.env($|\.(?!example$))|demo-data|\.vercel\//.test(f));
if (secret.length) { run('git reset -q'); console.error('\n✖ Stopped: these files may contain passwords and must not be uploaded:\n  ' + secret.join('\n  ')); process.exit(1); }

if (!staged.length) console.log('\n• No code changes to commit.');
else {
  console.log(`\n▶ Saving ${staged.length} changed file(s): "${msg}"`);
  execSync('git commit -q -F -', { input: msg, stdio: ['pipe', 'inherit', 'inherit'] });
}
console.log('\n▶ Uploading to GitHub (Vercel deploys automatically)…');
run('git push origin HEAD');
console.log('\n✔ Done. Office server: refresh the page now. Vercel: live in about a minute.\n');
