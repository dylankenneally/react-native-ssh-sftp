# Integration test harness

A disposable OpenSSH server plus a Node smoke test that exercises real SSH and
SFTP against it.

## What this validates (and what it does not)

This harness validates the **server fixture** and the shape of a real SSH/SFTP
session. The smoke test uses a standalone client ([`ssh2`](https://github.com/mscdex/ssh2)),
**not** this library.

`src/sshclient.ts` depends on the React Native native bridge
(`NativeModules.RNSSHClient`), which does not exist in a plain Node process, so it
cannot be driven end-to-end from Node. Doing that is the job of the deferred
**native e2e** phase (an example app running Detox or Maestro). This fixture is the
ready-made target for that future app. See the testing docs for the full picture.

## Prerequisites

- Docker (with the `docker compose` plugin)

## Running locally

The quickest path is the all-in-one script, which starts the fixture, runs the
test, and tears the fixture down (even if the test fails):

```bash
npm run test:integration:local
```

To manage the fixture yourself (useful when iterating, so you don't pay container
startup on every run):

```bash
# 1. Start the sshd fixture
docker compose -f test/integration/docker-compose.yml up -d

# 2. Run the smoke test (repeat as often as you like)
npm run test:integration

# 3. Tear the fixture down when finished
docker compose -f test/integration/docker-compose.yml down
```

If you run `npm run test:integration` without the fixture up, the test retries
briefly and then fails with a message telling you how to start it.

## Configuration

The smoke test reads connection details from the environment, with local defaults
that match `docker-compose.yml`:

| Variable         | Default       | Description                          |
| ---------------- | ------------- | ------------------------------------ |
| `SSH_HOST`       | `127.0.0.1`   | Host to connect to                   |
| `SSH_PORT`       | `2222`        | Port the fixture is published on     |
| `SSH_USER`       | `tester`      | Username                             |
| `SSH_PASSWORD`   | `testpass`    | Password                             |
| `SSH_REMOTE_DIR` | `/config`     | Writable remote directory for SFTP   |

The credentials are throwaway values for a local/CI-only container. Do not reuse
them anywhere real.
