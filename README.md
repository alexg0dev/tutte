# Tutte: how your data is handled

Tutte is a workspace for reverse engineering and building software. This repository is the part of it that touches your data, published so you can check what we say against the code.

It's source-available, not open source. See [License](#license).

## The short version

- Requests to the model carry your conversation and files, never your account ID, name or email.
- Every request is routed only to endpoints with a zero-data-retention policy, with logging and training off.
- We don't train any model on what you send.
- Chat history on your computer is encrypted with AES-256-GCM, under a key tied to your Windows account.
- Synced chats are encrypted on your device before upload. We store ciphertext.
- Replies are filtered so the model can't recite its instructions or name the systems behind it.

The details, including where each of these stops, are in [docs/requests.md](docs/requests.md) and [docs/encryption.md](docs/encryption.md).

## What's here

| File | |
| --- | --- |
| [`chat-crypto.js`](chat-crypto.js) | Encrypts chat history saved on your computer (desktop app). |
| [`cloud-chats.js`](cloud-chats.js) | Encrypts chats on your device before they sync, and handles the key. |
| [`redact.js`](redact.js) | Filters the model's output before it's shown to you. |
| [`test/`](test) | Tests you can run with Node 20 or newer. |

## What isn't

The model service, its configuration, prompts and keys. Tunny and Sprat may run on our own servers or on third-party inference providers, and we don't publish which providers or base models are involved. [docs/requests.md](docs/requests.md) covers what that means for your data. In short, nothing above changes.

## Found a problem?

See [SECURITY.md](SECURITY.md).

## License

Published so you can read and verify it, nothing more. You may not copy, modify, redistribute or use this code, commercially or otherwise. All rights reserved, see [LICENSE](LICENSE).

© 2026 Prismwell
