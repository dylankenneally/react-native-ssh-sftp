import { describe, it, expect, beforeEach } from 'vitest';
import SSHClient from '../../src/sshclient';
import { RNSSHClient, resetMocks } from '../mocks/react-native';
import { resolveNative, rejectNative } from './support';

describe('key utilities', () => {
  beforeEach(() => {
    resetMocks();
  });

  describe('getKeyDetails', () => {
    it('resolves with the key type and size', async () => {
      RNSSHClient.getKeyDetails.mockResolvedValue({ keyType: 'ssh-rsa', keySize: 2048 });

      await expect(SSHClient.getKeyDetails('KEY')).resolves.toEqual({ keyType: 'ssh-rsa', keySize: 2048 });
      expect(RNSSHClient.getKeyDetails).toHaveBeenCalledWith('KEY');
    });

    it('defaults keySize to 0 when the native side omits it', async () => {
      RNSSHClient.getKeyDetails.mockResolvedValue({ keyType: 'ssh-ed25519' });

      await expect(SSHClient.getKeyDetails('KEY')).resolves.toEqual({ keyType: 'ssh-ed25519', keySize: 0 });
    });

    it('rejects when the native lookup fails', async () => {
      RNSSHClient.getKeyDetails.mockRejectedValue('bad key');

      await expect(SSHClient.getKeyDetails('KEY')).rejects.toBe('bad key');
    });
  });

  describe('generateKeyPair', () => {
    it('resolves with the generated private and public keys', async () => {
      RNSSHClient.generateKeyPair.mockImplementation(resolveNative({ privateKey: 'PRIV', publicKey: 'PUB' }));

      await expect(SSHClient.generateKeyPair('rsa', 'phrase', 2048, 'comment')).resolves.toEqual({
        privateKey: 'PRIV',
        publicKey: 'PUB',
      });
      const args = RNSSHClient.generateKeyPair.mock.calls[0];
      expect(args.slice(0, 4)).toEqual(['rsa', 'phrase', 2048, 'comment']);
    });

    it('rejects when key generation fails', async () => {
      RNSSHClient.generateKeyPair.mockImplementation(rejectNative('gen failed'));

      await expect(SSHClient.generateKeyPair('rsa')).rejects.toBe('gen failed');
    });
  });
});
