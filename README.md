# Tutte — how your data is handled

Tutte is a workspace for reverse engineering and building software, powered by our own models, **Tunny** and **Sprat**. This repository is the part of Tutte that touches your data. It is public so you can read exactly how your chats and prompts are handled, rather than take our word for it.

## What we do with your data

- **We never train on your prompts.** Nothing you send is used to train Tunny, Sprat, or any model.
- **We don't retain prompts.** Prompts sent to our model are not stored after the response is produced.
- **We don't read your chats.** Your conversations are private.
- **Chats are encrypted on your device.** Saved chats are encrypted at rest with AES-256-GCM, under a key only your Windows account can unlock. See [`chat-crypto.js`](chat-crypto.js).
- **Your files stay yours.** Tutte only reads files and folders you explicitly point it at.

Requests go to our own model. This repository does not contain the model, our infrastructure, or any keys — those are not part of how your data is handled, and they are not published here.

## What's in here

| File | What it does |
| --- | --- |
| [`chat-crypto.js`](chat-crypto.js) | Encrypts and decrypts saved chats at rest (AES-256-GCM, key wrapped with Windows DPAPI). |
| [`redact.js`](redact.js) | Keeps the model's own instructions and internals out of anything shown to you. |

## Open core

The Tutte app's data handling is open. The models themselves and the service that runs them are not part of this repository.

## License

MIT — see [LICENSE](LICENSE).

© Prismwell
