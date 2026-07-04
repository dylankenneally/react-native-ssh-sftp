import { describe, it, expect, beforeEach } from 'vitest';
import type SSHClient from '../../src/sshclient';
import { PtyType } from '../../src/sshclient';
import { RNSSHClient, resetMocks, emitNativeEvent, listenerCount } from '../mocks/react-native';
import { resolveNative, lastCallArgs, connectedClient } from './support';

/** Starts a shell so a 'Shell' native listener is registered, and returns the client key. */
async function startShellAndGetKey(client: SSHClient): Promise<string> {
  RNSSHClient.startShell.mockImplementation(resolveNative(''));
  await client.startShell(PtyType.VANILLA);
  return lastCallArgs(RNSSHClient.startShell)[0] as string;
}

describe('event routing and disconnect cleanup', () => {
  beforeEach(() => {
    resetMocks();
  });

  describe('handleEvent routing', () => {
    it('dispatches to the registered handler when the event key matches', async () => {
      const client = await connectedClient('ios');
      const key = await startShellAndGetKey(client);
      const received: unknown[] = [];
      client.on('Shell', (value) => received.push(value));

      emitNativeEvent('Shell', { name: 'Shell', key, value: 'hello' });

      expect(received).toEqual(['hello']);
    });

    it('ignores events whose key does not match this client', async () => {
      const client = await connectedClient('ios');
      await startShellAndGetKey(client);
      const received: unknown[] = [];
      client.on('Shell', (value) => received.push(value));

      emitNativeEvent('Shell', { name: 'Shell', key: 'some-other-key', value: 'nope' });

      expect(received).toEqual([]);
    });

    it('ignores events for which no handler is registered', async () => {
      const client = await connectedClient('ios');
      const key = await startShellAndGetKey(client);

      // No handler registered for 'Shell'; dispatching must not throw.
      expect(() => emitNativeEvent('Shell', { name: 'Shell', key, value: 'x' })).not.toThrow();
    });

    it('isolates events between two concurrent clients', async () => {
      const clientA = await connectedClient('ios');
      const keyA = await startShellAndGetKey(clientA);
      const clientB = await connectedClient('ios');
      const keyB = await startShellAndGetKey(clientB);

      const receivedA: unknown[] = [];
      const receivedB: unknown[] = [];
      clientA.on('Shell', (v) => receivedA.push(v));
      clientB.on('Shell', (v) => receivedB.push(v));

      emitNativeEvent('Shell', { name: 'Shell', key: keyA, value: 'for-a' });
      emitNativeEvent('Shell', { name: 'Shell', key: keyB, value: 'for-b' });

      expect(receivedA).toEqual(['for-a']);
      expect(receivedB).toEqual(['for-b']);
    });
  });

  describe('disconnect cleanup', () => {
    it('calls native disconnect with the client key when nothing is active', async () => {
      const client = await connectedClient('ios');

      client.disconnect();

      expect(RNSSHClient.disconnect).toHaveBeenCalledTimes(1);
      expect(RNSSHClient.closeShell).not.toHaveBeenCalled();
      expect(lastCallArgs(RNSSHClient.disconnect)[0]).toBeTypeOf('string');
    });

    it('closes an active shell and tears down its listener (Android)', async () => {
      const client = await connectedClient('android');
      await startShellAndGetKey(client);
      RNSSHClient.connectSFTP.mockImplementation(resolveNative());
      await client.connectSFTP();
      expect(listenerCount()).toBe(3); // Shell + Download + Upload

      client.disconnect();

      expect(RNSSHClient.closeShell).toHaveBeenCalledTimes(1);
      expect(RNSSHClient.disconnectSFTP).toHaveBeenCalledTimes(1);
      expect(RNSSHClient.disconnect).toHaveBeenCalledTimes(1);
      expect(listenerCount()).toBe(0);
    });

    it('closes the shell but leaves SFTP untouched on iOS (documented no-op)', async () => {
      const client = await connectedClient('ios');
      await startShellAndGetKey(client);
      RNSSHClient.connectSFTP.mockImplementation(resolveNative());
      await client.connectSFTP();

      client.disconnect();

      // Shell is fully torn down.
      expect(RNSSHClient.closeShell).toHaveBeenCalledTimes(1);
      expect(listenerCount('Shell')).toBe(0);
      // iOS disconnectSFTP is a documented no-op: native method not called and
      // progress listeners remain registered (see review #6).
      expect(RNSSHClient.disconnectSFTP).not.toHaveBeenCalled();
      expect(listenerCount('DownloadProgress')).toBe(1);
      expect(listenerCount('UploadProgress')).toBe(1);
      expect(RNSSHClient.disconnect).toHaveBeenCalledTimes(1);
    });
  });
});
