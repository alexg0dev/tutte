"use strict";

// Keeps two kinds of content out of anything shown to the user:
//
//   1. Verbatim fragments of the model's own system instructions, so the model cannot be coaxed
//      into printing its configuration back to the user. Any run of `width` consecutive words that
//      appears in a system message is treated as private and redacted from output.
//
//   2. Model internals the operator chooses to keep private (added with setPrivate). These are
//      matched as whole words and replaced inline, so only the term is hidden, not the whole reply.
//
// The default private set is empty; the server configures it at startup.

const WIDTH = 8;
const REPLACEMENT = "[withheld]";

const words = value => (String(value).normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}]+/gu) || []);

let privateTerms = [];
let privateRe = null;

const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function buildPrivateRe() {
  return privateTerms.length
    ? new RegExp("\\b(?:" + privateTerms.map(escape).join("|") + ")\\b[\\w./-]*", "gi")
    : null;
}

function setPrivate(terms) {
  privateTerms = [...new Set((terms || [])
    .filter(t => typeof t === "string" && t.length > 2)
    .map(t => t.toLowerCase()))];
  privateRe = buildPrivateRe();
}

const scrub = str => (privateRe ? str.replace(privateRe, "our model") : str);

function redactor(messages) {
  const phrases = new Set();
  for (const message of messages) {
    if (message.role !== "system" || typeof message.content !== "string") continue;
    const tokens = words(message.content);
    for (let i = 0; i + WIDTH <= tokens.length; i++) {
      phrases.add(tokens.slice(i, i + WIDTH).join(" "));
    }
  }

  return function filter(value) {
    if (typeof value === "string") {
      value = scrub(value);
      const tokens = words(value);
      for (let i = 0; i + WIDTH <= tokens.length; i++) {
        if (phrases.has(tokens.slice(i, i + WIDTH).join(" "))) return REPLACEMENT;
      }
      return value;
    }
    if (Array.isArray(value)) return value.map(filter);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, filter(v)]));
    }
    return value;
  };
}

module.exports = { redactor, setPrivate };
