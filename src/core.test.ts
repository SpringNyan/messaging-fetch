import { expect, test } from "vitest";
import { createFetch, registerMessageHandler, type Port } from "./core";

test("createFetch & registerMessageHandler", async () => {
  function mockPorts() {
    let callback1: ((message: unknown) => void) | undefined;
    let callback2: ((message: unknown) => void) | undefined;

    const port1: Port = {
      postMessage: (message) => {
        callback2?.(message);
      },
      onMessage: (callback) => {
        callback1 = callback;
        return () => {
          callback1 = undefined;
        };
      },
    };

    const port2: Port = {
      postMessage: (message) => {
        callback1?.(message);
      },
      onMessage: (callback) => {
        callback2 = callback;
        return () => {
          callback2 = undefined;
        };
      },
    };

    return [port1, port2] as const;
  }

  const [port1, port2] = mockPorts();
  const messagingFetch = createFetch(port1);
  registerMessageHandler(port2);

  const exampleResponse = await messagingFetch("https://example.com");
  expect(exampleResponse.status).toBe(200);
  const exampleText = await exampleResponse.text();
  expect(exampleText).includes("Example Domain");

  const getResponse = await messagingFetch(
    "https://postman-echo.com/get?foo1=bar1&你好=世界",
  );
  expect(getResponse.status).toBe(200);
  const getJson = (await getResponse.json()) as {
    args: Record<string, string>;
  };
  expect(getJson.args["foo1"]).toBe("bar1");
  expect(getJson.args["你好"]).toBe("世界");

  const postResponse = await messagingFetch("https://postman-echo.com/post", {
    method: "POST",
    body: new URLSearchParams({ foo1: "bar1", 你好: "世界" }),
    duplex: "half", // for testing in nodejs
  } as RequestInit);
  expect(postResponse.status).toBe(200);
  const postJson = (await postResponse.json()) as {
    form: Record<string, string>;
  };
  expect(postJson.form["foo1"]).toBe("bar1");
  expect(postJson.form["你好"]).toBe("世界");
});
