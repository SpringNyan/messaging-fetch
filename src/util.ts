import type { MessageError } from "./message";

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
