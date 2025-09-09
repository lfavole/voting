// OpenPGP.js required (see templates for CDN)
// Encrypt token with user's public key
async function encryptToken(token, publicKeyArmored) {
    const publicKey = await openpgp.readKey({ armoredKey: publicKeyArmored });
    const encrypted = await openpgp.encrypt({
        message: await openpgp.createMessage({ text: token }),
        encryptionKeys: publicKey
    });
    return encrypted; // returns armored string
}

// Decrypt token with user's private key and passphrase
async function decryptToken(encrypted, privateKeyArmored, passphrase) {
    const privateKey = await openpgp.decryptKey({
        privateKey: await openpgp.readPrivateKey({ armoredKey: privateKeyArmored }),
        passphrase
    });
    const message = await openpgp.readMessage({ armoredMessage: encrypted });
    const { data: decrypted } = await openpgp.decrypt({
        message,
        decryptionKeys: privateKey
    });
    return decrypted;
}
