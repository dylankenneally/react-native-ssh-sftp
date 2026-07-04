import { describe, it, expect } from 'vitest';
import SSHClient from '../../src/sshclient';
import { RNSSHClient, emitNativeEvent, listenerCount, resetMocks } from '../mocks/react-native';

describe('module loads against the react-native mock', () => {
  it('imports the SSHClient default export', () => {
    expect(SSHClient).toBeTypeOf('function');
  });

  it('exposes the connection factory methods as statics', () => {
    expect(SSHClient.connectWithPassword).toBeTypeOf('function');
    expect(SSHClient.connectWithKey).toBeTypeOf('function');
    expect(SSHClient.generateKeyPair).toBeTypeOf('function');
    expect(SSHClient.getKeyDetails).toBeTypeOf('function');
  });

  it('shares the native mock instance with the class under test', () => {
    // The class imports 'react-native' (aliased); the test imports the mock by
    // relative path. Both must resolve to the same module instance.
    expect(RNSSHClient.connectToHost).toBeTypeOf('function');
    expect(resetMocks).toBeTypeOf('function');
    expect(emitNativeEvent).toBeTypeOf('function');
    expect(listenerCount()).toBe(0);
  });
});
