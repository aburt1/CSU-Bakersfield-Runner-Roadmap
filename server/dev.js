import { spawn } from 'child_process';

const RESTART_DELAY_MS = 1000;
let child = null;
let shuttingDown = false;

function startServer() {
  child = spawn(process.execPath, ['--watch', 'index.js'], {
    stdio: 'inherit',
    env: process.env,
  });

  child.on('exit', (code, signal) => {
    if (shuttingDown) return;

    const reason = signal ? `signal ${signal}` : `code ${code}`;
    console.log(`[dev-supervisor] Server process exited (${reason}). Restarting in ${RESTART_DELAY_MS}ms...`);

    setTimeout(() => {
      if (!shuttingDown) startServer();
    }, RESTART_DELAY_MS);
  });
}

function shutdown(signal) {
  shuttingDown = true;
  if (child && !child.killed) {
    child.kill(signal);
  }
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

startServer();
