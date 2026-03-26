import { spawn, type ChildProcess } from 'child_process';

const RESTART_DELAY_MS = 1000;
let child: ChildProcess | null = null;
let shuttingDown = false;

function startServer(): void {
  child = spawn(process.execPath, ['--watch', 'index.ts'], {
    stdio: 'inherit',
    env: process.env,
  });

  child.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
    if (shuttingDown) return;

    const reason = signal ? `signal ${signal}` : `code ${code}`;
    console.log(`[dev-supervisor] Server process exited (${reason}). Restarting in ${RESTART_DELAY_MS}ms...`);

    setTimeout(() => {
      if (!shuttingDown) startServer();
    }, RESTART_DELAY_MS);
  });
}

function shutdown(signal: string): void {
  shuttingDown = true;
  if (child && !child.killed) {
    child.kill(signal as NodeJS.Signals);
  }
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

startServer();
