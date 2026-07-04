/**
 * Integration smoke test for the OpenSSH fixture.
 *
 * This validates the containerized sshd defined in `docker-compose.yml` by driving
 * a real SSH exec and a full SFTP round-trip with a standalone client (`ssh2`).
 *
 * IMPORTANT: this does NOT exercise `src/sshclient.ts`. That module depends on the
 * React Native native bridge (`NativeModules.RNSSHClient`), which does not exist in
 * a plain Node process. Driving the library end-to-end is the job of the deferred
 * native e2e phase (an example app + Detox/Maestro). This suite proves the server
 * fixture works and is the ready-made target for that future app.
 *
 * Prerequisites: the fixture must be running.
 *   docker compose -f test/integration/docker-compose.yml up -d
 *
 * Run with: npm run test:integration
 * Or, to manage the fixture automatically: npm run test:integration:local
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { Client } from 'ssh2';

const config = {
  host: process.env.SSH_HOST || '127.0.0.1',
  port: Number(process.env.SSH_PORT || 2222),
  username: process.env.SSH_USER || 'tester',
  password: process.env.SSH_PASSWORD || 'testpass',
};

const REMOTE_DIR = process.env.SSH_REMOTE_DIR || '/config';

const FIXTURE_NOT_RUNNING = [
  `Could not reach sshd at ${config.host}:${config.port} — the OpenSSH fixture does not appear to be running.`,
  '',
  'Start it, then re-run the test:',
  '  docker compose -f test/integration/docker-compose.yml up -d',
  '  npm run test:integration',
  '',
  'Or run the whole cycle (start, test, stop) in one command:',
  '  npm run test:integration:local',
].join('\n');

let conn;

// Errors that mean "the container is still coming up" rather than "misconfigured".
// Docker publishes the port before sshd is ready, so a freshly started fixture can
// refuse the connection (ECONNREFUSED), accept then reset it mid-handshake
// (ECONNRESET), or time out (ETIMEDOUT) before sshd finishes initializing.
const TRANSIENT_STARTUP_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT']);
const CONNECT_BUDGET_MS = 60000;
const RETRY_DELAY_MS = 2000;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A single connection attempt. Settles exactly once, and keeps a persistent error
 * handler so that late errors from a discarded attempt (ssh2 emits a follow-up
 * "Connection lost before handshake" after a reset) are swallowed rather than
 * surfacing as an uncaught exception once the attempt has already been rejected.
 */
function attemptConnect() {
  return new Promise((resolve, reject) => {
    const client = new Client();
    let settled = false;
    client.on('ready', () => {
      if (!settled) {
        settled = true;
        resolve(client);
      }
    });
    client.on('error', (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
      // Later errors on this discarded client are intentionally ignored.
    });
    client.connect({ ...config, readyTimeout: 15000 });
  });
}

/**
 * Connects, retrying through transient startup errors until sshd is reachable or the
 * time budget elapses. Non-transient errors (e.g. auth failures) surface
 * immediately; a budget timeout produces the actionable "fixture not running"
 * message instead of a raw socket error.
 */
async function connect() {
  const deadline = Date.now() + CONNECT_BUDGET_MS;
  let attempt = 0;
  let lastError;
  while (Date.now() < deadline) {
    attempt += 1;
    try {
      return await attemptConnect();
    } catch (error) {
      lastError = error;
      if (!error || !TRANSIENT_STARTUP_CODES.has(error.code)) {
        throw error;
      }
      console.error(`sshd not ready yet (${error.code}), retry ${attempt}...`);
      await delay(RETRY_DELAY_MS);
    }
  }
  const failure = new Error(FIXTURE_NOT_RUNNING);
  failure.cause = lastError;
  throw failure;
}

function exec(client, command) {
  return new Promise((resolve, reject) => {
    client.exec(command, (error, stream) => {
      if (error) {
        return reject(error);
      }
      let stdout = '';
      stream
        .on('close', () => resolve(stdout))
        .on('data', (chunk) => {
          stdout += chunk.toString();
        })
        .stderr.on('data', () => {});
    });
  });
}

function sftp(client) {
  return new Promise((resolve, reject) => {
    client.sftp((error, session) => (error ? reject(error) : resolve(session)));
  });
}

function promisify1(fn, ctx) {
  return (...args) => new Promise((resolve, reject) => {
    fn.call(ctx, ...args, (error, result) => (error ? reject(error) : resolve(result)));
  });
}

before(async () => {
  conn = await connect();
});

after(() => {
  if (conn) {
    conn.end();
  }
});

test('runs a remote command over SSH', async () => {
  const output = await exec(conn, 'echo integration-ok');
  assert.match(output, /integration-ok/);
});

test('performs an SFTP write, list, read round-trip', async () => {
  const session = await sftp(conn);
  const writeFile = promisify1(session.writeFile, session);
  const readFile = promisify1(session.readFile, session);
  const readdir = promisify1(session.readdir, session);
  const unlink = promisify1(session.unlink, session);

  const name = `rnssh-int-${randomBytes(6).toString('hex')}.txt`;
  const remotePath = `${REMOTE_DIR}/${name}`;
  const payload = `hello ${Date.now()}`;

  try {
    await writeFile(remotePath, payload);

    const entries = await readdir(REMOTE_DIR);
    const names = entries.map((entry) => entry.filename);
    assert.ok(names.includes(name), `expected ${name} in directory listing`);

    const roundTripped = (await readFile(remotePath)).toString();
    assert.equal(roundTripped, payload);
  } finally {
    await unlink(remotePath).catch(() => {});
  }
});
