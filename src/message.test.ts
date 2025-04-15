import { expect, test } from "vitest";
import { isMessageLike } from "./message";

test("isMessageLike", () => {
  expect(isMessageLike(undefined)).toBe(false);
  expect(isMessageLike(null)).toBe(false);
  expect(isMessageLike(true)).toBe(false);
  expect(isMessageLike(1)).toBe(false);
  expect(isMessageLike("foo")).toBe(false);
  expect(isMessageLike(["foo"])).toBe(false);
  expect(isMessageLike({ foo: "bar" })).toBe(false);
  expect(isMessageLike({ type: "foo" })).toBe(false);
  expect(isMessageLike({ id: "foo" })).toBe(false);
  expect(isMessageLike({ type: "foo", id: 1 })).toBe(false);

  expect(isMessageLike({ type: "foo", id: "bar" })).toBe(true);
});
