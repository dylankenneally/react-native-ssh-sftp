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

let conn;

/** Opens a connection, retrying briefly so the test tolerates a just-started container. */
function connect(attemptsLeft = 10) {
  return new Promise((resolve, reject) => {
    const client = new Client();
    client.on('ready', () => resolve(client));
    client.on('error', (error) => {
      if (attemptsLeft > 0) {
        setTimeout(() => connect(attemptsLeft - 1).then(resolve, reject), 2000);
      } else {
        reject(error);
      }
    });
    client.connect({ ...config, readyTimeout: 20000 });
  });
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
