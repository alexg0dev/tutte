# Encryption

Your data is encrypted in three places. Each section says what it protects against and where it stops.

## On the way to the model

Requests travel over HTTPS (TLS). The model has to read your request to answer it, so it's decrypted on the provider's side while it's being processed, and not kept afterwards (see [requests.md](requests.md)). This is true of every hosted model; anyone claiming end-to-end encryption all the way through a hosted model is describing something else.

## Chat history on your computer

[`chat-crypto.js`](../chat-crypto.js), desktop app only.

- Each saved chat is encrypted with AES-256-GCM before it's written to disk. On disk a chat looks like `TUTTE-ENC1:` followed by base64 of a 12-byte IV, the 16-byte auth tag and the ciphertext.
- The 256-bit key is generated once per install and kept at `%LOCALAPPDATA%\Tutte\keys\chats.key`.
- On Windows that key is wrapped with DPAPI (CurrentUser scope), so it only unlocks for your Windows account on that machine. On other systems it's a plain key file readable only by your user.
- Chats saved by older versions as plain JSON still open, and are encrypted the next time they're saved.

This protects your history if the disk, a backup or the chat folder is copied somewhere else. It doesn't protect against malware already running as you, which can ask DPAPI to unwrap the key the same way Tutte does.

## Synced chats

[`cloud-chats.js`](../cloud-chats.js), when you're signed in.

Chats are encrypted on your device with AES-256-GCM before upload. The title, messages and summary are all inside the encrypted blob. What we can see is that a chat exists, its size, and when it was last updated.

Where the key comes from depends on how you sign in:

- **Email and password.** The key is derived from your password with PBKDF2-SHA256, 150,000 iterations, salted with your account ID. The same password on another device gives the same key.
- **Google or Discord.** There's no password to derive from, so the key is random. You set a chat passphrase, and your account stores the key only wrapped under it (PBKDF2-SHA256, 310,000 iterations, random 16-byte salt, AES-256-GCM). On a new device you enter the passphrase to unwrap it. A wrong passphrase fails the GCM check and nothing is saved.

Once unlocked, the key is kept in local storage on that device, so you don't re-enter it every visit.

Limits, plainly:

- Your password also signs you in, so it reaches our sign-in service over HTTPS when you log in, and that service stores only a hash of it. In principle whoever runs sign-in could derive your key at that moment. A Google or Discord passphrase never leaves your device.
- If you reset your password, chats synced under the old one can't be opened any more. If you forget your passphrase you can set a new one, but chats synced under the old one stay locked. We can't recover either. That's the point of the design.
- Anything that can run code in the page, like a malicious browser extension, can read the key from local storage.

## Checking it yourself

With Node 20 or newer:

```
node test/cloud-chats.test.js
node test/redact.test.js
```

The sync tests run `cloud-chats.js` against a fake account and check that the account only ever holds the wrapped key, that a wrong passphrase is refused, that a second device unlocks the same key, and that a saved chat is ciphertext on the server and opens on the other device.
