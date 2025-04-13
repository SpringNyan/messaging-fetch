import { registerMessageHandler } from "messaging-fetch";

chrome.runtime.onConnect.addListener(function (port) {
  if (port.name !== "messaging-fetch") {
    return;
  }

  registerMessageHandler({
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
});
