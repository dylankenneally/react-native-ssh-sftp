import type { Mock } from 'vitest';
import SSHClient from '../../src/sshclient';
import { RNSSHClient, setPlatform } from '../mocks/react-native';

/**
 * Shared helpers for driving the mocked native module in unit tests.
 *
 * Most native methods on `RNSSHClient` take a trailing Node-style callback
 * `(error, response?)`. These helpers install `vi.fn` implementations that invoke
 * that trailing callback so a test can steer a method down its success or error
 * path without knowing the exact argument count.
 */

// The real React Native bridge always invokes native callbacks asynchronously,
// after the current synchronous frame unwinds. We mirror that with a microtask so
// patterns like `const result = new SSHClient(..., cb => resolve(result))` (where
// the callback closes over a binding assigned after construction) behave correctly.
function deferCallback(callback: (error: unknown, response?: unknown) => void, error: unknown, response?: unknown): void {
  queueMicrotask(() => callback(error, response));
}

/** Invokes the trailing callback argument with `(null, response)` asynchronously. */
export function resolveNative(response?: unknown) {
  return (...args: unknown[]): void => {
    const callback = args[args.length - 1] as (error: unknown, response?: unknown) => void;
    deferCallback(callback, null, response);
  };
}

/** Invokes the trailing callback argument with `(error)` asynchronously. */
export function rejectNative(error: unknown) {
  return (...args: unknown[]): void => {
    const callback = args[args.length - 1] as (error: unknown) => void;
    deferCallback(callback, error);
  };
}

interface DeferredNative {
  /** Use as the mock implementation: `mock.mockImplementation(deferred.impl)`. */
  impl: (...args: unknown[]) => void;
  /** Resolve or reject the captured callback later. */
  invoke: (error: unknown, response?: unknown) => void;
  /** Whether the native method has been called (callback captured). */
  readonly called: boolean;
}

/**
 * Captures the trailing callback instead of invoking it, so a test can resolve or
 * reject the native call later (useful for asserting in-flight state).
 */
export function deferNative(): DeferredNative {
  let captured: ((error: unknown, response?: unknown) => void) | undefined;
  return {
    impl(...args: unknown[]): void {
      captured = args[args.length - 1] as (error: unknown, response?: unknown) => void;
    },
    invoke(error: unknown, response?: unknown): void {
      if (!captured) {
        throw new Error('native method was not called yet');
      }
      captured(error, response);
    },
    get called(): boolean {
      return captured !== undefined;
    },
  };
}

/** Returns the arguments of the most recent call to a mock. */
export function lastCallArgs(mock: Mock): unknown[] {
  return mock.mock.calls[mock.mock.calls.length - 1];
}

/**
 * Creates and returns a successfully connected client on the given platform.
 * Resets the connect mock afterwards so per-test assertions start from zero calls.
 */
export async function connectedClient(os: 'ios' | 'android' = 'ios'): Promise<SSHClient> {
  setPlatform(os);
  const connectMethod = os === 'ios' ? RNSSHClient.connectToHost : RNSSHClient.connectToHostByPassword;
  connectMethod.mockImplementation(resolveNative());
  const client = await SSHClient.connectWithPassword('host', 22, 'user', 'pw');
  connectMethod.mockClear();
  return client;
}

/** Returns the trailing callback captured by the most recent call to `mock`. */
export function callbackOf(mock: Mock): (error: unknown, response?: unknown) => void {
  const args = lastCallArgs(mock);
  return args[args.length - 1] as (error: unknown, response?: unknown) => void;
}
