import type { MessageError } from "./message";

export async function* streamToLatin1Generator(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  const decoder = new TextDecoder("latin1");
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    yield decoder.decode(value);
  }
}

export function latin1ToBytes(latin1: string): Uint8Array {
  const bytes = new Uint8Array(latin1.length);
  for (let i = 0; i < latin1.length; i++) {
    bytes[i] = latin1.charCodeAt(i);
  }
  return bytes;
}

export function toJsError(messageError: MessageError): Error {
  const { name, message } = messageError;

  if (name === "AbortError") {
    return new DOMException(message, "AbortError");
  }

  const ErrorConstructor = globalThis[name as keyof typeof globalThis] as
    | (new (message: string) => Error)
    | undefined;

  if (ErrorConstructor && typeof ErrorConstructor === "function") {
    try {
      return new ErrorConstructor(message);
    } catch {
      // fallback
    }
  }

  const error = new Error(message);
  error.name = name;
  return error;
}

export function toMessageError(error: unknown): MessageError {
  const messageError: MessageError = { name: "Error", message: "" };
  if (error instanceof Error) {
    messageError.name = error.name;
    messageError.message = error.message;
  } else {
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    messageError.message = `${error}`;
  }
  return messageError;
}
