import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

for (const name of ['DATABASE_URL', 'APP_ORIGIN', 'API_ADDR']) {
  if (!process.env[name]) {
    console.error(`${name} is required. Copy .env.example to .env first.`);
    process.exit(1);
  }
}

const root = fileURLToPath(new URL('../', import.meta.url));
await mkdir(`${root}.local`, { recursive: true });
const build = Bun.spawn(
  ['go', 'build', '-o', `${root}.local/small-hero-api`, './cmd/server'],
  {
    cwd: `${root}server`,
    stdout: 'inherit',
    stderr: 'inherit',
  },
);
const buildExit = await build.exited;
if (buildExit !== 0) process.exit(buildExit);
const children = [
  Bun.spawn([`${root}.local/small-hero-api`], {
    cwd: root,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  }),
  Bun.spawn(['bun', 'node_modules/vite/bin/vite.js', '--host', '127.0.0.1'], {
    cwd: root,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  }),
];

let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
const firstExit = await Promise.race(children.map((child) => child.exited));
stop();
await Promise.all(children.map((child) => child.exited));
process.exit(firstExit);
