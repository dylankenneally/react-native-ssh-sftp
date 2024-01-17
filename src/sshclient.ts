import {
  Platform,
  NativeModules,
  NativeEventEmitter,
  DeviceEventEmitter,
  EmitterSubscription
} from 'react-native';

const { RNSSHClient } = NativeModules;

const RNSSHClientEmitter = new NativeEventEmitter(RNSSHClient);

const NATIVE_EVENT_SHELL = 'Shell';
const NATIVE_EVENT_DOWNLOAD_PROGRESS = 'DownloadProgress';
const NATIVE_EVENT_UPLOAD_PROGRESS = 'UploadProgress';

interface NativeEvent {
  name: string;
  key: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any;
}

export enum PtyType {
  VANILLA = 'vanilla',
  VT100 = 'vt100',
  VT102 = 'vt102',
  VT220 = 'vt220',
  ANSI = 'ansi',
  XTERM = 'xterm',
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CBError = any;

export type CallbackFunction<T> = (error: CBError, response?: T) => void;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EventHandler = (value: any) => void;

export interface LsResult {
  filename: string;
  isDirectory: boolean;
  modificationDate: string;
  lastAccess: string;
  fileSize: number;
  ownerUserID: number;
  ownerGroupID: number;
  flags: number;
}

export interface KeyPair {
  privateKey: string;
  publicKey?: string;
  passphrase?: string;
}

export type PasswordOrKey = string | KeyPair;

/**
 * Manage a connection to an SSH Server
 *
 * Instances of SSHClient are created using the following factory functions:
 * - SSHClient.connectWithKey()
 * - SSHClient.connectWithPassword()
 */
export default class SSHClient {
  /** Connect using a key.
   *
   * @param privateKey
   * The private key, in OpenSSH format.
   * Only support RSA, DSA, ECDSA
   *
   * @param passphrase
   * Passphrase to unlock the private key. Can be omitted.
   *
   * Return a promise that resolve when the connection is established.
   * privateKey is a string.
   */
  static connectWithKey(host: string, port: number, username: string, privateKey: string, passphrase?: string, callback?: CallbackFunction<SSHClient>): Promise<SSHClient> {
    return new Promise((resolve, reject) => {
      const result = new SSHClient(host, port, username, { privateKey, passphrase }, (error: CBError) => {
        if (callback) {
          callback(error);
        }

        if (error) {
          return reject(error);
        }

        resolve(result);
      }
      );
    });
  }

  /** Connect using a password */
  static connectWithPassword(host: string, port: number, username: string, password: string, callback: CallbackFunction<SSHClient>): Promise<SSHClient> {
    return new Promise((resolve, reject) => {
      const result = new SSHClient(host, port, username, password, (error: CBError) => {
        if (callback) {
          callback(error);
        }

        if (error) {
          return reject(error);
        }

        resolve(result);
      });
    });
  }

  /** "unique" key to identify callback from native library */
  private _key: string;
  private _listeners: Record<string, EmitterSubscription>;
  private _counters: { download: number; upload: number; };
  private _activeStream: {  sftp: boolean; shell: boolean; };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _handlers: Record<string, EventHandler>;
  private host: string;
  private port: number;
  private username: string;

  /**
   * Generic constructor
   *
   * Should not be called directly; use factory functions instead.
   */
  constructor(host: string, port: number, username: string, passwordOrKey: PasswordOrKey, callback: CallbackFunction<void>) {
    this._key = SSHClient._getRandomClientKey();
    this._listeners = {};
    this._counters = {
      download: 0,
      upload: 0,
    };
    this._activeStream = {
      sftp: false,
      shell: false,
    };
    this._handlers = {};
    this.host = host;
    this.port = port;
    this.username = username;
    this._connect(passwordOrKey, callback);
  }

  /**
   * Return a random client key.
   *
   * This key is used to identify which callback match with which instance.
   */
  static _getRandomClientKey(): string {
    // TODO This should be returned by the native code
    // There's no need for actual randomness, just uniqueness.
    return Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .substring(1);
  }

  /**
   * Callback used to dispatch events
   */
  _handleEvent(event: NativeEvent): void {
    if (this._handlers[event.name] && this._key === event.key) {
      this._handlers[event.name](event.value);
    }
  }

  /**
   * Register an event handler
   */
  on(eventName: string, handler: EventHandler): void {
    this._handlers[eventName] = handler;
  }

  /**
   * Register this instance to handle a native event
   *
   * @param eventName
   * Name of the event. Must match when calling unregisterNativeListener()
   */
  _registerNativeListener(eventName: string): void {
    const listenerInterface = Platform.OS === 'ios' ? RNSSHClientEmitter : DeviceEventEmitter;
    this._listeners[eventName] = listenerInterface.addListener(eventName, this._handleEvent.bind(this));
  }

  /**
   * Unregister a native event listener
   *
   * @param eventName
   * Must match the value from registerNativeListener()
   */
  _unregisterNativeListener(eventName: string): void {
    const listener = this._listeners[eventName];
    if (listener) {
      listener.remove();
      delete this._listeners[eventName];
    }
  }

  /**
   * Perform actual connection to server.
   * Called automatically by constructor.
   */
  _connect(passwordOrKey: PasswordOrKey, callback: CallbackFunction<void>): void {
    if (Platform.OS === 'android') {
      if (typeof passwordOrKey === 'string') {
        RNSSHClient.connectToHostByPassword(this.host, this.port, this.username, passwordOrKey, this._key, (error: CBError) => { callback(error); });
      } else {
        RNSSHClient.connectToHostByKey(this.host, this.port, this.username, passwordOrKey, this._key, (error: CBError) => { callback(error); });
      }

      return;
    }

    // iOS...
    RNSSHClient.connectToHost(this.host, this.port, this.username, passwordOrKey, this._key, (error: CBError) => { callback(error); });
  }

  /**
   * Execute a command on the remote server
   *
   * @param command
   * Command to execute, as a string
   *
   * @return
   * A promise
   */
  execute(command: string, callback?: CallbackFunction<string>): Promise<string> {
    return new Promise((resolve, reject) => {
      RNSSHClient.execute(command, this._key, (error: CBError, response: string) => {
        if (callback) {
          callback(error, response);
        }

        if (error) {
          return reject(error);
        }

        resolve(response);
      });
    });
  }

  /**
   * Open a shell on the remote.
   *
   * You must handle the "Shell" events to get the shell outputs.
   *
   * @param {string} ptyType
   * vanilla, vt100, vt102, vt220, ansi, xterm
   *
   * @return
   * A Promise that resolve with the initial output
   */
  startShell(ptyType: PtyType, callback?: CallbackFunction<string>): Promise<string> {
    if (this._activeStream.shell) {
      return Promise.resolve('');
    }

    return new Promise((resolve, reject) => {
      this._registerNativeListener(NATIVE_EVENT_SHELL);
      RNSSHClient.startShell(this._key, ptyType, (error: CBError, response: string) => {
        if (callback) {
          callback(error, response);
        }

        if (error) {
          return reject(error);
        }

        this._activeStream.shell = true;
        resolve(response);
      });
    });
  }

  /**
   * Make sure that a shell connection is open
   */
  _checkShell(callback?: CallbackFunction<string>): Promise<string> {
    if (this._activeStream.shell) {
      return Promise.resolve('');
    }

    return this.startShell(PtyType.VANILLA)
      .then((res) => (res ? res + '\n' : ''))
      .catch((error: CBError) => {
        if (callback) {
          callback(error);
        }

        throw error;
      });
  }

  /**
   * Send some input to the server
   *
   * @return
   * A promise with the immediate reply
   */
  writeToShell(command: string, callback?: CallbackFunction<string>): Promise<string> {
    return this._checkShell(callback)
      .then(() => new Promise((resolve, reject) => {
        RNSSHClient.writeToShell(command, this._key, (error: CBError, response: string) => {
          if (callback) {
            callback(error, response);
          }

          if (error) {
            return reject(error);
          }

          resolve(response);
        });
      }));
  }

  /**
   * Close the open shell connection
   */
  closeShell(): void {
    this._unregisterNativeListener(NATIVE_EVENT_SHELL);
    // TODO this should use a callback too
    RNSSHClient.closeShell(this._key);
    this._activeStream.shell = false;
  }

  /**
   * Open an SFTP connection on the server
   *
   * It is not mandatory to call this method before calling any SFTP method.
   *
   * @return
   * A promise
   */
  connectSFTP(callback?: CallbackFunction<void>): Promise<void> {
    if (this._activeStream.sftp) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      RNSSHClient.connectSFTP(this._key, (error: CBError) => {
        this._activeStream.sftp = true;
        this._registerNativeListener(NATIVE_EVENT_DOWNLOAD_PROGRESS);
        this._registerNativeListener(NATIVE_EVENT_UPLOAD_PROGRESS);
        if (callback) {
          callback(error);
        }

        if (error) {
          return reject(error);
        }

        resolve();
      });
    });
  }

  /**
   * Make sure an SFTP connection is open
   *
   * @return
   * A promise
   */
  _checkSFTP<ResultType>(callback?: CallbackFunction<ResultType>): Promise<void> {
    if (this._activeStream.sftp) {
      return Promise.resolve();
    }

    return this.connectSFTP()
      .catch((error: CBError) => {
        if (callback) {
          callback(error);
        }

        throw error;
      });
  }

  /**
   * List a directory content on the server
   *
   * @param path
   * The path to list
   *
   * @return
   * A promise with the file listing as an object.
   */
  sftpLs(path: string, callback: CallbackFunction<LsResult>): Promise<LsResult> {
    return this._checkSFTP(callback)
      .then(() => new Promise((resolve, reject) => {
        RNSSHClient.sftpLs(path, this._key, (error: CBError, response: LsResult) => {
          if (callback) {
            callback(error, response);
          }

          if (error) {
            return reject(error);
          }

          resolve(response);
        });
      }));
  }

  /**
   * Rename a file on the server
   *
   * @return
   * A promise
   */
  sftpRename(oldPath: string, newPath: string, callback: CallbackFunction<void>): Promise<void> {
    return this._checkSFTP(callback)
      .then(() => new Promise((resolve, reject) => {
        RNSSHClient.sftpRename(oldPath, newPath, this._key, (error: CBError) => {
          if (callback) {
            callback(error);
          }

          if (error) {
            return reject(error);
          }

          resolve();
        });
      })
      );
  }

  /**
   * Create a directory on the server
   *
   * @return
   * A promise
   */
  sftpMkdir(path: string, callback: CallbackFunction<void>): Promise<void> {
    return this._checkSFTP(callback)
      .then(() => new Promise((resolve, reject) => {
        RNSSHClient.sftpMkdir(path, this._key, (error: CBError) => {
          if (callback) {
            callback(error);
          }

          if (error) {
            return reject(error);
          }

          resolve();
        });
      })
      );
  }

  /**
   * Unlink a file on the server
   *
   * @return
   * A promise
   */
  sftpRm(path: string, callback: CallbackFunction<void>): Promise<void> {
    return this._checkSFTP(callback)
      .then(() => new Promise((resolve, reject) => {
        RNSSHClient.sftpRm(path, this._key, (error: CBError) => {
          if (callback) {
            callback(error);
          }

          if (error) {
            return reject(error);
          }

          resolve();
        });
      })
      );
  }

  /**
   * Remove a directory from the server
   *
   * @return
   * A promise
   */
  sftpRmdir(path: string, callback: CallbackFunction<void>): Promise<void> {
    return this._checkSFTP(callback)
      .then(() => new Promise((resolve, reject) => {
        RNSSHClient.sftpRmdir(path, this._key, (error: CBError) => {
          if (callback) {
            callback(error);
          }

          if (error) {
            return reject(error);
          }

          resolve();
        });
      })
      );
  }

  /**
   * chmod a path on the remote
   *
   * Only available on Android
   *
   * @return
   * A promise
   */
  sftpChmod(path: string, permissions: number, callback: CallbackFunction<void>): Promise<void> {
    return this._checkSFTP(callback)
      .then(() => new Promise((resolve, reject) => {
        RNSSHClient.sftpChmod(path, permissions, this._key, (error: CBError) => {
          if (callback) {
            callback(error);
          }

          if (error) {
            return reject(error);
          }

          resolve();
        });
      })
      );
  }

  /**
   * Upload a file
   *
   * @param localFilePath
   * Path to the source file on the filesystem
   *
   * @param remoteFilePath
   * Path for the file on the remote server
   *
   * @return
   * A promise
   */
  sftpUpload(localFilePath: string, remoteFilePath: string, callback: CallbackFunction<void>): Promise<void> {
    return this._checkSFTP(callback)
      .then(() => new Promise((resolve, reject) => {
        ++this._counters.upload;
        RNSSHClient.sftpUpload(localFilePath, remoteFilePath, this._key, (error: CBError) => {
          --this._counters.upload;
          if (callback) {
            callback(error);
          }

          if (error) {
            return reject(error);
          }

          resolve();
        });
      })
      );
  }

  /**
   * Cancel a pending upload
   */
  sftpCancelUpload(): void {
    if (this._counters.upload > 0) {
      RNSSHClient.sftpCancelUpload(this._key);
    }
  }

  /**
   * Download a file from the server
   *
   * @param remoteFilePath
   * Path to the file on the remote server
   *
   * @param localFilePath
   * Path to the file on the local filesystem
   *
   * @return
   * A promise
   */
  sftpDownload(remoteFilePath: string, localFilePath: string, callback?: CallbackFunction<string>): Promise<string> {
    return this._checkSFTP(callback)
      .then(() => new Promise((resolve, reject) => {
        ++this._counters.download;
        RNSSHClient.sftpDownload(remoteFilePath, localFilePath, this._key, (error: CBError, response: string) => {
          --this._counters.download;
          if (callback) {
            callback(error, response);
          }

          if (error) {
            return reject(error);
          }

          resolve(response);
        });
      })
      );
  }

  /**
   * Cancel a pending download
   */
  sftpCancelDownload(): void {
    if (this._counters.download > 0) {
      RNSSHClient.sftpCancelDownload(this._key);
    }
  }

  /**
   * Close an open SFTP connection on the remote server
   */
  disconnectSFTP(): void {
    // TODO This require a fix in the native part. I don't care.
    // It actually still work since the native code disconnect() will actually
    // close the sftp stream.
    // Only downside is we can't *explicitly* close the sftp channel.
    if (Platform.OS !== 'ios') {
      this._unregisterNativeListener(NATIVE_EVENT_DOWNLOAD_PROGRESS);
      this._unregisterNativeListener(NATIVE_EVENT_UPLOAD_PROGRESS);
      RNSSHClient.disconnectSFTP(this._key);
      this._activeStream.sftp = false;
    }
  }

  /**
   * Close an open SSH connection on the remote server
   */
  disconnect(): void {
    if (this._activeStream.shell) {
      this.closeShell();
    }

    if (this._activeStream.sftp) {
      this.disconnectSFTP();
    }

    // TODO this should use a callback too
    RNSSHClient.disconnect(this._key);
  }
}
