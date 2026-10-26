// Starts the API (port 3001) and Vite (port 5173) together. Ctrl+C stops both.
import { spawn } from 'node:child_process';

const procs = [
  ['api', 'node --watch server/index.ts'],
  ['web', 'npx vite --host'],
].map(([name, cmd]) => {
  const child = spawn(cmd, { shell: true, stdio: ['inherit', 'pipe', 'pipe'] });
  const prefix = name === 'api' ? '\x1b[33m[api]\x1b[0m ' : '\x1b[36m[web]\x1b[0m ';
  const pipe = (stream, out) => stream.on('data', (d) => out.write(String(d).replace(/^(?=.)/gm, prefix)));
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on('exit', (code) => {
    console.log(`${prefix}terminó (${code ?? 'señal'})`);
    for (const p of procs) if (!p.killed) p.kill();
    process.exit(code ?? 0);
  });
  return child;
});

process.on('SIGINT', () => procs.forEach((p) => p.kill()));
