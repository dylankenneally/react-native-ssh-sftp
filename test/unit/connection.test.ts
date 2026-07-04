import { describe, it, expect, beforeEach } from 'vitest';
import SSHClient from '../../src/sshclient';
import { RNSSHClient, resetMocks, setPlatform } from '../mocks/react-native';
import { resolveNative, rejectNative, lastCallArgs } from './support';

describe('connection factories and platform dispatch', () => {
  beforeEach(() => {
    resetMocks();
  });

  describe('connectWithPassword', () => {
    it('resolves with an SSHClient instance on success', async () => {
      setPlatform('ios');
      RNSSHClient.connectToHost.mockImplementation(resolveNative());

      const client = await SSHClient.connectWithPassword('host', 22, 'user', 'pw');

      expect(client).toBeInstanceOf(SSHClient);
      expect(RNSSHClient.connectToHost).toHaveBeenCalledTimes(1);
    });

    it('rejects when the native connect fails', async () => {
      RNSSHClient.connectToHost.mockImplementation(rejectNative('boom'));

      await expect(SSHClient.connectWithPassword('host', 22, 'user', 'pw')).rejects.toBe('boom');
    });

    it('invokes the legacy callback with the error and resolves/rejects consistently', async () => {
      RNSSHClient.connectToHost.mockImplementation(rejectNative('nope'));
      const seen: unknown[] = [];

      await expect(
        SSHClient.connectWithPassword('host', 22, 'user', 'pw', (error) => seen.push(error)),
      ).rejects.toBe('nope');
      expect(seen).toEqual(['nope']);
    });

    it('invokes the legacy callback with no error on success', async () => {
      RNSSHClient.connectToHost.mockImplementation(resolveNative());
      const seen: unknown[] = [];

      await SSHClient.connectWithPassword('host', 22, 'user', 'pw', (error) => seen.push(error));

      expect(seen).toEqual([null]);
    });
  });

  describe('connectWithKey', () => {
    it('resolves with an SSHClient instance on success', async () => {
      setPlatform('ios');
      RNSSHClient.connectToHost.mockImplementation(resolveNative());

      const client = await SSHClient.connectWithKey('host', 22, 'user', 'PRIVATE_KEY', 'passphrase');

      expect(client).toBeInstanceOf(SSHClient);
      expect(RNSSHClient.connectToHost).toHaveBeenCalledTimes(1);
    });

    it('rejects when the native connect fails', async () => {
      RNSSHClient.connectToHost.mockImplementation(rejectNative('bad-key'));

      await expect(SSHClient.connectWithKey('host', 22, 'user', 'PRIVATE_KEY')).rejects.toBe('bad-key');
    });
  });

  describe('platform dispatch', () => {
    it('uses connectToHost with the raw password on iOS', async () => {
      setPlatform('ios');
      RNSSHClient.connectToHost.mockImplementation(resolveNative());

      await SSHClient.connectWithPassword('h', 2222, 'u', 'secret');

      expect(RNSSHClient.connectToHostByPassword).not.toHaveBeenCalled();
      const args = lastCallArgs(RNSSHClient.connectToHost);
      expect(args.slice(0, 5)).toEqual(['h', 2222, 'u', 'secret', expect.any(String)]);
    });

    it('uses connectToHostByPassword with a string credential on Android', async () => {
      setPlatform('android');
      RNSSHClient.connectToHostByPassword.mockImplementation(resolveNative());

      await SSHClient.connectWithPassword('h', 2222, 'u', 'secret');

      expect(RNSSHClient.connectToHost).not.toHaveBeenCalled();
      const args = lastCallArgs(RNSSHClient.connectToHostByPassword);
      expect(args.slice(0, 5)).toEqual(['h', 2222, 'u', 'secret', expect.any(String)]);
    });

    it('uses connectToHostByKey with a key object on Android', async () => {
      setPlatform('android');
      RNSSHClient.connectToHostByKey.mockImplementation(resolveNative());

      await SSHClient.connectWithKey('h', 2222, 'u', 'PRIVATE_KEY', 'phrase');

      expect(RNSSHClient.connectToHostByPassword).not.toHaveBeenCalled();
      const args = lastCallArgs(RNSSHClient.connectToHostByKey);
      expect(args[0]).toBe('h');
      expect(args[3]).toEqual({ privateKey: 'PRIVATE_KEY', passphrase: 'phrase' });
    });
  });

  describe('client key generation', () => {
    it('passes a string key to the native layer', async () => {
      setPlatform('ios');
      RNSSHClient.connectToHost.mockImplementation(resolveNative());

      await SSHClient.connectWithPassword('h', 22, 'u', 'p');

      const key = RNSSHClient.connectToHost.mock.calls[0][4];
      expect(key).toBeTypeOf('string');
      expect((key as string).length).toBeGreaterThan(0);
    });

    it('generates overwhelmingly unique keys across many clients', async () => {
      setPlatform('ios');
      RNSSHClient.connectToHost.mockImplementation(resolveNative());

      const count = 50;
      for (let i = 0; i < count; i++) {
        await SSHClient.connectWithPassword('h', 22, 'u', 'p');
      }

      const keys = RNSSHClient.connectToHost.mock.calls.map((call) => call[4]);
      const unique = new Set(keys);
      // The current 16-bit key space makes rare collisions possible (a documented
      // limitation), so we assert near-total uniqueness rather than perfection.
      expect(unique.size).toBeGreaterThanOrEqual(count - 1);
    });
  });
});
