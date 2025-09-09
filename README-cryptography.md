# Client-side Cryptography for Voting Token

## Overview

- Uses [OpenPGP.js](https://openpgpjs.org/) for GPG encryption/decryption.
- The user's GPG public key is stored in their profile.
- Tokens for voting are encrypted on the client side before submission.

## Example Usage

### Encrypt token

```js
const token = 'sample-token-from-server';
const publicKeyArmored = '-----BEGIN PGP PUBLIC KEY BLOCK ... END PGP PUBLIC KEY BLOCK-----';
encryptToken(token, publicKeyArmored).then(encryptedToken => {
    // Send encryptedToken to server or display to user
});
```

### Decrypt token

```js
const encrypted = '-----BEGIN PGP MESSAGE ... END PGP MESSAGE-----';
const privateKeyArmored = '-----BEGIN PGP PRIVATE KEY BLOCK ... END PGP PRIVATE KEY BLOCK-----';
const passphrase = 'your-passphrase';
decryptToken(encrypted, privateKeyArmored, passphrase).then(decrypted => {
    // Use decrypted token for voting
});
```

## Integration

- Place `crypto.js` in `static/voting/`.
- Load OpenPGP.js via CDN in your templates.
- Use the functions in your voting flow templates.
