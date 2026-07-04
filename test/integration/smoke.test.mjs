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

const FIXTURE_UNREACHABLE = [
  `Could not establish an SSH session with sshd at ${config.host}:${config.port} within the time budget.`,
  '',
  'The most likely cause is that the OpenSSH fixture is not running. Start it, then',
  're-run the test:',
  '  docker compose -f test/integration/docker-compose.yml up -d',
  '  npm run test:integration',
  '',
  'Or run the whole cycle (start, test, stop) in one command:',
  '  npm run test:integration:local',
].join('\n');

let conn;

// Total time to keep retrying while the container comes up, and the pause between
// attempts. The budget is generous because a cold `docker compose up` has to pull
// the image and let sshd fully initialize. Override via env if needed.
const CONNECT_BUDGET_MS = Number(process.env.SSH_CONNECT_BUDGET_MS || 60000);
const RETRY_DELAY_MS = Number(process.env.SSH_RETRY_DELAY_MS || 2000);

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

/** Short, human-readable reason for a connection error, used in retry logging. */
function describeError(error) {
  if (!error) {
    return 'unknown error';
  }
  return error.code || error.level || error.message || 'unknown error';
}

/**
 * Connects, retrying through the container's entire startup window until sshd is
 * fully ready or the time budget elapses.
 *
 * A freshly started fixture can fail in several transient ways before it is ready,
 * and which one you hit is timing-dependent:
 *   - the port refuses the connection (ECONNREFUSED) — sshd not listening yet;
 *   - the connection is reset mid-handshake (ECONNRESET) — sshd starting;
 *   - the handshake times out;
 *   - sshd completes the handshake but rejects authentication
 *     ("All configured authentication methods failed", level 'client-authentication')
 *     because the test user has not been provisioned yet.
 *
 * All of these are retried within the budget — during startup they all mean "not
 * ready yet". Only after the budget elapses do we give up, with an actionable
 * message that also includes the last error seen.
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
      console.error(`sshd not ready yet (${describeError(error)}), retry ${attempt}...`);
      await delay(RETRY_DELAY_MS);
    }
  }
  const failure = new Error(`${FIXTURE_UNREACHABLE}\n\nLast error after ${attempt} attempt(s): ${describeError(lastError)}`);
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
