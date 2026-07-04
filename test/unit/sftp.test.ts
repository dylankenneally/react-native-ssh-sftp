import { describe, it, expect, beforeEach } from 'vitest';
import type SSHClient from '../../src/sshclient';
import { RNSSHClient, resetMocks, listenerCount } from '../mocks/react-native';
import { resolveNative, rejectNative, deferNative, lastCallArgs, connectedClient } from './support';

describe('SFTP operations, counters, and cancellation', () => {
  let client: SSHClient;

  beforeEach(async () => {
    resetMocks();
    client = await connectedClient('ios');
  });

  describe('connectSFTP / checkSFTP auto-connect', () => {
    it('connects and registers the transfer progress listeners', async () => {
      RNSSHClient.connectSFTP.mockImplementation(resolveNative());

      await client.connectSFTP();

      expect(RNSSHClient.connectSFTP).toHaveBeenCalledTimes(1);
      expect(listenerCount('DownloadProgress')).toBe(1);
      expect(listenerCount('UploadProgress')).toBe(1);
    });

    it('auto-connects on the first SFTP operation, then reuses the connection', async () => {
      RNSSHClient.connectSFTP.mockImplementation(resolveNative());
      RNSSHClient.sftpMkdir.mockImplementation(resolveNative());

      await client.sftpMkdir('/tmp/a');
      await client.sftpMkdir('/tmp/b');

      // connectSFTP should only run once for the two operations.
      expect(RNSSHClient.connectSFTP).toHaveBeenCalledTimes(1);
      expect(RNSSHClient.sftpMkdir).toHaveBeenCalledTimes(2);
    });

    // KNOWN BUG (see scratch/kiro-review-2026.07.04.md #5): connectSFTP sets
    // `_activeStream.sftp = true` and registers listeners *before* the error check,
    // so a failed connect still marks SFTP active. This test documents the intended
    // behavior and is skipped until the source bug is fixed.
    it.skip('should NOT mark SFTP active when the native connect fails', async () => {
      RNSSHClient.connectSFTP.mockImplementation(rejectNative('sftp connect failed'));

      await expect(client.connectSFTP()).rejects.toBe('sftp connect failed');

      // Intended: a subsequent op should retry the connection rather than assume it succeeded.
      RNSSHClient.connectSFTP.mockClear();
      RNSSHClient.sftpMkdir.mockImplementation(resolveNative());
      await client.sftpMkdir('/tmp/x');
      expect(RNSSHClient.connectSFTP).toHaveBeenCalledTimes(1);
    });
  });

  describe('sftpLs', () => {
    beforeEach(() => {
      RNSSHClient.connectSFTP.mockImplementation(resolveNative());
    });

    it('parses each JSON entry into an LsResult', async () => {
      const entry = JSON.stringify({
        filename: 'file.txt',
        isDirectory: false,
        modificationDate: '2026-07-04',
        lastAccess: '2026-07-04',
        fileSize: 1024,
        ownerUserID: 501,
        ownerGroupID: 20,
        flags: 0,
      });
      RNSSHClient.sftpLs.mockImplementation(resolveNative([entry]));

      const result = await client.sftpLs('/tmp');

      expect(result).toHaveLength(1);
      expect(result[0].filename).toBe('file.txt');
      expect(result[0].fileSize).toBe(1024);
    });

    it('strips control characters before parsing so JSON.parse does not throw', async () => {
      // Embed a raw control char (0x01) inside the JSON string payload.
      const withControlChar = '{"filename":"a\u0001b","isDirectory":false,"modificationDate":"","lastAccess":"","fileSize":0,"ownerUserID":0,"ownerGroupID":0,"flags":0}';
      RNSSHClient.sftpLs.mockImplementation(resolveNative([withControlChar]));

      const result = await client.sftpLs('/tmp');

      expect(result).toHaveLength(1);
      // The control char is removed, leaving the surrounding characters intact.
      expect(result[0].filename).toBe('ab');
    });

    it('rejects when the native listing fails', async () => {
      RNSSHClient.sftpLs.mockImplementation(rejectNative('ls failed'));

      await expect(client.sftpLs('/nope')).rejects.toBe('ls failed');
    });
  });

  describe('directory and file operations', () => {
    beforeEach(() => {
      RNSSHClient.connectSFTP.mockImplementation(resolveNative());
    });

    const cases: Array<{ name: string; run: (c: SSHClient) => Promise<unknown>; mock: () => void; assertArgs: () => void }> = [
      {
        name: 'sftpRename',
        run: (c) => c.sftpRename('/a', '/b'),
        mock: () => RNSSHClient.sftpRename.mockImplementation(resolveNative()),
        assertArgs: () => expect(lastCallArgs(RNSSHClient.sftpRename).slice(0, 2)).toEqual(['/a', '/b']),
      },
      {
        name: 'sftpMkdir',
        run: (c) => c.sftpMkdir('/dir'),
        mock: () => RNSSHClient.sftpMkdir.mockImplementation(resolveNative()),
        assertArgs: () => expect(lastCallArgs(RNSSHClient.sftpMkdir)[0]).toBe('/dir'),
      },
      {
        name: 'sftpRm',
        run: (c) => c.sftpRm('/file'),
        mock: () => RNSSHClient.sftpRm.mockImplementation(resolveNative()),
        assertArgs: () => expect(lastCallArgs(RNSSHClient.sftpRm)[0]).toBe('/file'),
      },
      {
        name: 'sftpRmdir',
        run: (c) => c.sftpRmdir('/dir'),
        mock: () => RNSSHClient.sftpRmdir.mockImplementation(resolveNative()),
        assertArgs: () => expect(lastCallArgs(RNSSHClient.sftpRmdir)[0]).toBe('/dir'),
      },
      {
        name: 'sftpChmod',
        run: (c) => c.sftpChmod('/file', 0o644),
        mock: () => RNSSHClient.sftpChmod.mockImplementation(resolveNative()),
        assertArgs: () => expect(lastCallArgs(RNSSHClient.sftpChmod).slice(0, 2)).toEqual(['/file', 0o644]),
      },
    ];

    for (const testCase of cases) {
      it(`${testCase.name} resolves and forwards its arguments`, async () => {
        testCase.mock();

        await expect(testCase.run(client)).resolves.toBeUndefined();

        testCase.assertArgs();
      });
    }

    it('sftpMkdir rejects on native error', async () => {
      RNSSHClient.sftpMkdir.mockImplementation(rejectNative('mkdir failed'));

      await expect(client.sftpMkdir('/dir')).rejects.toBe('mkdir failed');
    });
  });

  describe('transfers, counters, and cancellation', () => {
    beforeEach(() => {
      RNSSHClient.connectSFTP.mockImplementation(resolveNative());
    });

    it('sftpUpload resolves and forwards local/remote paths', async () => {
      RNSSHClient.sftpUpload.mockImplementation(resolveNative());

      await expect(client.sftpUpload('/local', '/remote')).resolves.toBeUndefined();

      expect(lastCallArgs(RNSSHClient.sftpUpload).slice(0, 2)).toEqual(['/local', '/remote']);
    });

    it('sftpDownload resolves with the response path', async () => {
      RNSSHClient.sftpDownload.mockImplementation(resolveNative('/local/file'));

      await expect(client.sftpDownload('/remote/file', '/local/file')).resolves.toBe('/local/file');
    });

    it('sftpCancelUpload is a no-op when no upload is in flight', () => {
      client.sftpCancelUpload();

      expect(RNSSHClient.sftpCancelUpload).not.toHaveBeenCalled();
    });

    it('sftpCancelUpload cancels an in-flight upload, then the transfer settles', async () => {
      // First establish the SFTP connection so the upload starts synchronously.
      await client.connectSFTP();

      const deferred = deferNative();
      RNSSHClient.sftpUpload.mockImplementation(deferred.impl);
      const uploadPromise = client.sftpUpload('/local', '/remote');
      await Promise.resolve(); // let checkSFTP + the upload call run

      client.sftpCancelUpload();
      expect(RNSSHClient.sftpCancelUpload).toHaveBeenCalledTimes(1);

      deferred.invoke(null);
      await expect(uploadPromise).resolves.toBeUndefined();

      // Counter is back to zero: another cancel does nothing.
      RNSSHClient.sftpCancelUpload.mockClear();
      client.sftpCancelUpload();
      expect(RNSSHClient.sftpCancelUpload).not.toHaveBeenCalled();
    });

    it('sftpCancelDownload is a no-op when no download is in flight', () => {
      client.sftpCancelDownload();

      expect(RNSSHClient.sftpCancelDownload).not.toHaveBeenCalled();
    });

    it('sftpCancelDownload cancels an in-flight download', async () => {
      await client.connectSFTP();

      const deferred = deferNative();
      RNSSHClient.sftpDownload.mockImplementation(deferred.impl);
      const downloadPromise = client.sftpDownload('/remote', '/local');
      await Promise.resolve();

      client.sftpCancelDownload();
      expect(RNSSHClient.sftpCancelDownload).toHaveBeenCalledTimes(1);

      deferred.invoke(null, '/local');
      await expect(downloadPromise).resolves.toBe('/local');
    });
  });
});
