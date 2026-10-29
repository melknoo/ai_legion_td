// Production builds report uncaught errors to the game server (/client-error), which logs
// them and lists them on its stats page. A handful per page load is enough to spot a bug.
const MAX_REPORTS = 5;

let sent = 0;

function report(message: string, source: string, stack: string): void {
  if (sent++ >= MAX_REPORTS) return;
  const body = JSON.stringify({ message: message.slice(0, 300), source: source.slice(0, 200), stack: stack.slice(0, 1500) });
  fetch('/client-error', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {
    // Nowhere left to report to; the game keeps running.
  });
}

export function installErrorReporting(): void {
  window.addEventListener('error', (e) => {
    const where = e.filename ? `${e.filename.replace(location.origin, '')}:${e.lineno}:${e.colno}` : '';
    report(String(e.message), where, e.error instanceof Error ? (e.error.stack ?? '') : '');
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r: unknown = e.reason;
    report(r instanceof Error ? r.message : String(r), 'unhandledrejection', r instanceof Error ? (r.stack ?? '') : '');
  });
}
