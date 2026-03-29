const fs = require('fs');
const net = require('net');
const path = require('path');

const LISTEN_HOST = process.env.PROXY_LISTEN_HOST || '0.0.0.0';
const LISTEN_PORT = Number(process.env.PROXY_LISTEN_PORT || 5064);
const UPSTREAM_HOST = process.env.PROXY_UPSTREAM_HOST || 'www.gps2828.com';
const UPSTREAM_PORT = Number(process.env.PROXY_UPSTREAM_PORT || 7018);
const LOG_DIR = process.env.PROXY_LOG_DIR || path.join(__dirname, '..', 'protocol-logs');
const MAX_PREVIEW_BYTES = Number(process.env.PROXY_MAX_PREVIEW_BYTES || 96);

function ensureLogDir() {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function logFilePath() {
  const day = new Date().toISOString().slice(0, 10);
  return path.join(LOG_DIR, `vendor-proxy-${day}.jsonl`);
}

function toHex(buffer) {
  return buffer.toString('hex').toUpperCase().match(/.{1,2}/g)?.join(' ') || '';
}

function previewHex(buffer) {
  const preview = buffer.subarray(0, MAX_PREVIEW_BYTES);
  return toHex(preview);
}

function appendLog(entry) {
  ensureLogDir();
  fs.appendFileSync(
    logFilePath(),
    `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`,
    'utf8',
  );
}

let connectionCounter = 0;

const server = net.createServer((clientSocket) => {
  const connectionId = ++connectionCounter;
  const clientAddress = `${clientSocket.remoteAddress || 'unknown'}:${clientSocket.remotePort || 0}`;
  const upstreamSocket = net.createConnection({
    host: UPSTREAM_HOST,
    port: UPSTREAM_PORT,
  });

  console.log(`[proxy:${connectionId}] client connected from ${clientAddress}`);
  appendLog({
    connectionId,
    event: 'client_connected',
    clientAddress,
    upstream: `${UPSTREAM_HOST}:${UPSTREAM_PORT}`,
  });

  clientSocket.on('data', (data) => {
    appendLog({
      connectionId,
      direction: 'tracker_to_upstream',
      size: data.length,
      previewHex: previewHex(data),
      rawHex: toHex(data),
    });
    upstreamSocket.write(data);
  });

  upstreamSocket.on('data', (data) => {
    appendLog({
      connectionId,
      direction: 'upstream_to_tracker',
      size: data.length,
      previewHex: previewHex(data),
      rawHex: toHex(data),
    });
    clientSocket.write(data);
  });

  upstreamSocket.on('connect', () => {
    console.log(`[proxy:${connectionId}] upstream connected to ${UPSTREAM_HOST}:${UPSTREAM_PORT}`);
    appendLog({
      connectionId,
      event: 'upstream_connected',
      upstream: `${UPSTREAM_HOST}:${UPSTREAM_PORT}`,
    });
  });

  const closeBoth = (reason, error) => {
    if (!clientSocket.destroyed) clientSocket.destroy();
    if (!upstreamSocket.destroyed) upstreamSocket.destroy();
    appendLog({
      connectionId,
      event: reason,
      error: error ? String(error.message || error) : undefined,
    });
  };

  clientSocket.on('error', (error) => {
    console.error(`[proxy:${connectionId}] client error: ${error.message}`);
    closeBoth('client_error', error);
  });

  upstreamSocket.on('error', (error) => {
    console.error(`[proxy:${connectionId}] upstream error: ${error.message}`);
    closeBoth('upstream_error', error);
  });

  clientSocket.on('close', () => {
    appendLog({ connectionId, event: 'client_closed' });
    if (!upstreamSocket.destroyed) upstreamSocket.end();
  });

  upstreamSocket.on('close', () => {
    appendLog({ connectionId, event: 'upstream_closed' });
    if (!clientSocket.destroyed) clientSocket.end();
  });
});

server.on('error', (error) => {
  console.error(`[proxy] server error: ${error.message}`);
  process.exitCode = 1;
});

server.listen(LISTEN_PORT, LISTEN_HOST, () => {
  console.log(
    `[proxy] listening on ${LISTEN_HOST}:${LISTEN_PORT} -> ${UPSTREAM_HOST}:${UPSTREAM_PORT}`,
  );
  appendLog({
    event: 'server_started',
    listen: `${LISTEN_HOST}:${LISTEN_PORT}`,
    upstream: `${UPSTREAM_HOST}:${UPSTREAM_PORT}`,
  });
});
