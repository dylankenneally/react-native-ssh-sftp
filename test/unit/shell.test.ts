import { describe, it, expect, beforeEach } from 'vitest';
import type SSHClient from '../../src/sshclient';
import { PtyType } from '../../src/sshclient';
import { RNSSHClient, resetMocks, listenerCount } from '../mocks/react-native';
import { resolveNative, rejectNative, lastCallArgs, connectedClient } from './support';

describe('command execution and shell lifecycle', () => {
  let client: SSHClient;

  beforeEach(async () => {
    resetMocks();
    client = await connectedClient('ios');
  });

  describe('execute', () => {
    it('resolves with the command output', async () => {
      RNSSHClient.execute.mockImplementation(resolveNative('command output'));

      await expect(client.execute('ls -la')).resolves.toBe('command output');

      const args = lastCallArgs(RNSSHClient.execute);
      expect(args[0]).toBe('ls -la');
      expect(args[1]).toBeTypeOf('string'); // client key
    });

    it('rejects and still invokes the legacy callback on error', async () => {
      RNSSHClient.execute.mockImplementation(rejectNative('exec failed'));
      const seen: unknown[] = [];

      await expect(client.execute('boom', (error, response) => seen.push([error, response]))).rejects.toBe('exec failed');
      expect(seen).toEqual([['exec failed', undefined]]);
    });

    it('passes output to the legacy callback on success', async () => {
      RNSSHClient.execute.mockImplementation(resolveNative('out'));
      const seen: unknown[] = [];

      await client.execute('cmd', (error, response) => seen.push([error, response]));

      expect(seen).toEqual([[null, 'out']]);
    });
  });

  describe('startShell', () => {
    it('registers the Shell listener and marks the stream active', async () => {
      RNSSHClient.startShell.mockImplementation(resolveNative('shell ready'));

      const result = await client.startShell(PtyType.XTERM);

      expect(result).toBe('shell ready');
      expect(listenerCount('Shell')).toBe(1);
      const args = lastCallArgs(RNSSHClient.startShell);
      expect(args[1]).toBe(PtyType.XTERM);
    });

    it('short-circuits to an empty string when a shell is already active', async () => {
      RNSSHClient.startShell.mockImplementation(resolveNative('first'));
      await client.startShell(PtyType.VANILLA);
      RNSSHClient.startShell.mockClear();

      const result = await client.startShell(PtyType.VANILLA);

      expect(result).toBe('');
      expect(RNSSHClient.startShell).not.toHaveBeenCalled();
    });

    it('rejects on native error and invokes the legacy callback', async () => {
      RNSSHClient.startShell.mockImplementation(rejectNative('no shell'));
      const seen: unknown[] = [];

      await expect(client.startShell(PtyType.VANILLA, (error) => seen.push(error))).rejects.toBe('no shell');
      expect(seen).toEqual(['no shell']);
    });
  });

  describe('writeToShell', () => {
    it('auto-starts a shell when none is active, then writes', async () => {
      RNSSHClient.startShell.mockImplementation(resolveNative(''));
      RNSSHClient.writeToShell.mockImplementation(resolveNative('written'));

      const result = await client.writeToShell('echo hi\n');

      expect(RNSSHClient.startShell).toHaveBeenCalledTimes(1);
      expect(result).toBe('written');
      const args = lastCallArgs(RNSSHClient.writeToShell);
      expect(args[0]).toBe('echo hi\n');
    });

    it('does not start a second shell when one is already active', async () => {
      RNSSHClient.startShell.mockImplementation(resolveNative('ready'));
      await client.startShell(PtyType.VANILLA);
      RNSSHClient.startShell.mockClear();
      RNSSHClient.writeToShell.mockImplementation(resolveNative('ok'));

      await client.writeToShell('cmd\n');

      expect(RNSSHClient.startShell).not.toHaveBeenCalled();
      expect(RNSSHClient.writeToShell).toHaveBeenCalledTimes(1);
    });

    it('rejects when the write fails', async () => {
      RNSSHClient.startShell.mockImplementation(resolveNative(''));
      RNSSHClient.writeToShell.mockImplementation(rejectNative('write failed'));

      await expect(client.writeToShell('cmd\n')).rejects.toBe('write failed');
    });
  });

  describe('closeShell', () => {
    it('unregisters the Shell listener and clears the active flag', async () => {
      RNSSHClient.startShell.mockImplementation(resolveNative('ready'));
      await client.startShell(PtyType.VANILLA);
      expect(listenerCount('Shell')).toBe(1);

      client.closeShell();

      expect(RNSSHClient.closeShell).toHaveBeenCalledTimes(1);
      expect(listenerCount('Shell')).toBe(0);

      // After closing, starting again should re-invoke the native method.
      RNSSHClient.startShell.mockClear();
      RNSSHClient.startShell.mockImplementation(resolveNative('again'));
      await client.startShell(PtyType.VANILLA);
      expect(RNSSHClient.startShell).toHaveBeenCalledTimes(1);
    });
  });
});
