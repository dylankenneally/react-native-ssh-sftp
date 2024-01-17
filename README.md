# SSH and SFTP client library for React Native

SSH and SFTP client library for React Native.

## Installation

This fork of the library is not published on npmjs, yet.

To use it, clone the repository, install & pack it as a node module, then install that locally in your project.

```bash
git clone git@github.com:dylankenneally/react-native-ssh-sftp.git
cd react-native-ssh-sftp
npm install
npm pack
cd ../your_project
npm install ../react-native-ssh-sftp/react-native-ssh-sftp-*.tgz
```

### iOS

Update your `Podfile` to use [NMSSH](https://github.com/NMSSH/NMSSH) v2.2.9. Your `Podfile` is located in your React Native project at `./ios/Podfile`.

```ruby
target '[your project's name]' do
  pod 'NMSSH', '2.2.9' # <-- add this line
  # ... rest of your target details ...
end
```

And then run `pod install` in your `./ios` directory.

```bash
cd ios
pod install
cd -
```

> [!TIP]
> Adding a `postinstall` script to your `package.json` file to run `pod install` after `npm install` is a good idea. The [`pod-install`](https://www.npmjs.com/package/pod-install) package is a good way to do this.
>
> ```json
> {
>   "scripts": {
>     "postinstall": "npx pod-install",
>   }
> }
> ```

### Android

No additional steps are needed for Android.

### Linking

This project has been updated to use React Native v73 (the latest at the time of writing, Jan 2024) - which means that manual linking is not required.

## Usage

All functions that run asynchronously where we have to wait for a result returns Promises that can reject if an error occurred.

### Create a client using password authentication

```javascript
import SSHClient from 'react-native-ssh-sftp';

SSHClient.connectWithPassword(
  "10.0.0.10",
  22,
  "user",
  "password"
).then(client => {/*...*/});
```

### Create a client using public key authentication

```javascript
import SSHClient from 'react-native-ssh-sftp';

SSHClient.connectWithKey(
  "10.0.0.10",
  22,
  "user",
  privateKey="-----BEGIN RSA...",
  passphrase
).then(client => {/*...*/});
```

#### Public key authentication is also supported

```plaintext
{privateKey: '-----BEGIN RSA......'}
{privateKey: '-----BEGIN RSA......', publicKey: 'ssh-rsa AAAAB3NzaC1yc2EA......'}
{privateKey: '-----BEGIN RSA......', publicKey: 'ssh-rsa AAAAB3NzaC1yc2EA......', passphrase: 'Password'}
```

### Close client

```javascript
client.disconnect();
```

### Execute SSH command

```javascript
const command = 'ls -l';
client.execute(command)
  .then(output => console.warn(output));
```

### Shell

#### Start shell

- Supported ptyType: vanilla, vt100, vt102, vt220, ansi, xterm

```javascript
const ptyType = 'vanilla';
client.startShell(ptyType)
  .then(() => {/*...*/});
```

#### Read from shell

```javascript
client.on('Shell', (event) => {
  if (event)
    console.warn(event);
});
```

#### Write to shell

```javascript
const str = 'ls -l\n';
client.writeToShell(str)
  .then(() => {/*...*/});
```

#### Close shell

```javascript
client.closeShell();
```

### SFTP

#### Connect SFTP

```javascript
client.connectSFTP()
  .then(() => {/*...*/});
```

#### List directory

```javascript
const path = '.';
client.sftpLs(path)
  .then(response => console.warn(response));
```

#### Create directory

```javascript
client.sftpMkdir('dirName')
  .then(() => {/*...*/});
```

#### Rename file or directory

```javascript
client.sftpRename('oldName', 'newName')
  .then(() => {/*...*/});
```

#### Remove directory

```javascript
client.sftpRmdir('dirName')
  .then(() => {/*...*/});
```

#### Remove file

```javascript
client.sftpRm('fileName')
  .then(() => {/*...*/});
```

#### Download file

```javascript
client.sftpDownload('[path-to-remote-file]', '[path-to-local-directory]')
  .then(downloadedFilePath => {
    console.warn(downloadedFilePath);
  });

// Download progress (setup before call)
client.on('DownloadProgress', (event) => {
  console.warn(event);
});

// Cancel download
client.sftpCancelDownload();
```

#### Upload file

```javascript
client.sftpUpload('[path-to-local-file]', '[path-to-remote-directory]')
  .then(() => {/*...*/});

// Upload progress (setup before call)
client.on('UploadProgress', (event) => {
  console.warn(event);
});

// Cancel upload
client.sftpCancelUpload();
```

#### Close SFTP

```javascript
client.disconnectSFTP();
```

## Credits

This package wraps the following libraries, which provide the actual SSH/SFTP functionality:

- [NMSSH](https://github.com/NMSSH/NMSSH) for iOS
- [JSch](http://www.jcraft.com/jsch/) for Android

This package is a fork of Emmanuel Natividad's [react-native-ssh-sftp](https://github.com/enatividad/react-native-ssh-sftp) package. The fork chain from there is as follows:

1. [Gabriel Paul "Cley Faye" Risterucci](https://github.com/KeeeX/react-native-ssh-sftp)
1. [Bishoy Mikhael](https://github.com/MrBmikhael/react-native-ssh-sftp)
1. [Qian Sha](https://github.com/shaqian/react-native-ssh-sftp)

## TODO list

- [x] README to have credits to original author(s)/repos
- [x] package details correct? podspec details correct?
- [x] repo settings (security, etc)
- [ ] sort out the grunt stuff, post install script, etc
- [ ] review/update dev devs
  - [x] typescript
  - [ ] eslint
- [ ] review src/*ts files
- [ ] linting, tsconfig, etc
- [ ] contributing guide
- [ ] update dependencies, look at PR's in upstream repos
- [ ] update versioning (auto on commit?)
- [ ] gh actions
  - [x] depenabot updates
  - [ ] build on PR
  - [ ] tag
  - [ ] publish to npmjs
- [ ] publish on npmjs
- [ ] example app to be restored
- [ ] iOS support to be made functional (again)
- [ ] look at using the latest version of NMSSH
- [ ] engines (node/npm) in package.json
