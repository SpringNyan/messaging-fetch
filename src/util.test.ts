import { expect, test } from "vitest";
import { toJsError, toMessageError } from "./util";

test("toJsError & toMessageError", () => {
  function testError(error: Error) {
    const jsError = toJsError(toMessageError(error));
    expect(jsError.name).toBe(error.name);
    expect(jsError.message).toBe(error.message);
    expect(jsError.constructor).toBe(error.constructor);
  }

  testError(new Error());
  testError(new Error("foo"));
  testError(new TypeError("foo"));
  testError(new DOMException("foo", "AbortError"));

  const unknownError = toJsError({
    name: "FooError",
    message: "foo",
  });
  expect(unknownError.name).eq("FooError");
  expect(unknownError.message).eq("foo");
  expect(unknownError instanceof Error);
});
