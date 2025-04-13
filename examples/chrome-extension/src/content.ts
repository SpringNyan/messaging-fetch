import { createFetch } from "messaging-fetch";

const port = chrome.runtime.connect({
  name: "messaging-fetch",
});
const messagingFetch = createFetch({
  postMessage: (msg) => {
    port.postMessage(msg);
  },
  onMessage: (callback) => {
    port.onMessage.addListener(callback);
    return () => {
      port.onMessage.removeListener(callback);
    };
  },
});

void (async () => {
  const response = await messagingFetch("https://example.com");
  const text = await response.text();
  console.log(text);
})();
