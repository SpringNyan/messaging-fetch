# messaging-fetch

[![npm](https://img.shields.io/npm/v/messaging-fetch.svg)](https://www.npmjs.com/package/messaging-fetch)

A proxy library that enables fetch API calls across different JavaScript contexts through message passing.

## Installation

```bash
npm install messaging-fetch
```

## Usage Example

### Chrome Extension Example

Background script:

```typescript
import { registerMessageHandler } from "messaging-fetch";

chrome.runtime.onConnect.addListener(function (port) {
  if (port.name !== "messaging-fetch") return;

  registerMessageHandler({
    postMessage: (msg) => port.postMessage(msg),
    onMessage: (callback) => {
      port.onMessage.addListener(callback);
      return () => port.onMessage.removeListener(callback);
    },
  });
});
```

Content script:

```typescript
import { createFetch } from "messaging-fetch";

const port = chrome.runtime.connect({ name: "messaging-fetch" });
const messagingFetch = createFetch({
  postMessage: (msg) => port.postMessage(msg),
  onMessage: (callback) => {
    port.onMessage.addListener(callback);
    return () => port.onMessage.removeListener(callback);
  },
});

// Use like regular fetch
const response = await messagingFetch("https://example.com");
const text = await response.text();
```

## License

MIT
