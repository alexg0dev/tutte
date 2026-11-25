# What happens to a request

From pressing Enter to reading the answer.

1. Your message goes to the model service over HTTPS, along with the rest of the conversation and any files or screenshots you attached.
2. Tutte adds its own instructions (how to use the tools, how to answer) and settings like context size and reasoning depth.
3. The request is sent to the model. Nothing identifying you is attached: no account ID, name or email.
4. The answer streams back through the output filter in [`redact.js`](../redact.js) before you see it.

## Retention and training

Every call Tutte makes to the model is routed only to endpoints with a zero-data-retention policy, with prompt logging and training switched off. That covers everything, not just your visible replies: sub-agents, conversation summaries and chat titles go out the same way, so your content never takes a side path.

We don't train any model on what you send. We don't sell it, and nobody gets it except the provider processing the request.

Tutte's service doesn't write your messages to its logs. If the model returns an error, the first 300 characters of that error message are logged so we can fix it.

## Where chats are kept

- **Desktop app.** The service runs on your computer and saves your chat history there, encrypted. See [encryption.md](encryption.md).
- **Signed in.** Chats are encrypted on your device before they sync. We store ciphertext.

## What we don't publish

Tunny and Sprat may run on our own servers or on third-party inference providers. We don't say which providers, or which base models they're built on. That's a business decision. It doesn't change anything above: the retention, training and identity rules apply wherever a request runs, and they're set on every request.

Keeping it private takes more than not writing it down, because a model will happily talk about itself. So the output filter does two things:

- If a reply repeats 8 or more consecutive words of Tutte's own instructions, the whole reply is replaced with `[withheld]`.
- Names we keep private (provider, base model, internal hostnames) are replaced with "our model" wherever they appear, including inside tool results.

The list of private names is set by the service at startup. It isn't in this repository, for the obvious reason.

The filter only changes what's shown to you. It doesn't touch what's sent to the model, and it can't be used to hide anything about how your data is handled; that's all on this page.

## Not in this repository

The model service itself, its configuration, its prompts and its keys. Publishing them wouldn't tell you more about your data, and part of it is what we keep private above.
