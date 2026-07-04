# Contributing Guide

Thank you for your interest in contributing to `react-native-ssh-sftp`.

## Getting Started

1. Fork the repository
1. Clone your fork: `git clone https://github.com/your-username/react-native-ssh-sftp.git`
1. Install dependencies: `npm install`
1. Create a feature branch: `git checkout -b feature/your-feature`

## Development

- Follow the existing code style
- Write clear commit messages
- Add documentation if needed
  - See the [contributing guide for the documentation](./docs/CONTRIBUTING.md)

## Testing

The library is tested in tiers. Full details, including how the `react-native` mock
works and how to add a test, are in the [Testing guide](./docs/guides/testing.mdx).

- **Unit tests** ([Vitest](https://vitest.dev)) cover the TypeScript API in
  `src/sshclient.ts` with the native bridge mocked:

  ```bash
  npm test               # run once
  npm run test:watch     # re-run on change
  npm run test:coverage  # run with coverage thresholds
  ```

  The pre-commit hook runs the unit suite with coverage; a failing test or
  sub-threshold coverage blocks the commit. New code should arrive with tests.

- **Integration tests** run a Dockerized OpenSSH server and a Node smoke test that
  performs a real SSH command and an SFTP round-trip. The all-in-one script starts
  the fixture, runs the test, and tears it down:

  ```bash
  npm run test:integration:local
  ```

  Or manage the fixture yourself when iterating:

  ```bash
  docker compose -f test/integration/docker-compose.yml up -d
  npm run test:integration
  docker compose -f test/integration/docker-compose.yml down
  ```

Native unit tests (XCTest / JUnit) and native end-to-end tests (an example app with
Detox or Maestro) are planned future work — see the Testing guide for details.

## Submitting Changes

1. [Raise an issue](https://github.com/dylankenneally/react-native-ssh-sftp/issues/new/choose) for the work you are doing, if one does not already exist
1. Push to your fork
1. Open a Pull Request with a clear description
1. Reference any [related issues](https://github.com/dylankenneally/react-native-ssh-sftp/issues)
1. Wait for review and address feedback

## Code of Conduct

Please be respectful and constructive in all interactions.

## Questions?

[Open an issue](https://github.com/dylankenneally/react-native-ssh-sftp/issues/new/choose) or reach out to the maintainers, or use the [Community Discussions](https://github.com/dylankenneally/react-native-ssh-sftp/discussions).
