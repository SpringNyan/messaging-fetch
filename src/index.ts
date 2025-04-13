import type {
  AbortMessage,
  ErrorMessage,
  MessageError,
  RequestBodyChunkMessage,
  RequestBodyDoneMessage,
  RequestMessage,
  ResponseBodyChunkMessage,
  ResponseBodyDoneMessage,
  ResponseMessage,
} from "./message";
import {
  isMessage,
  MESSAGING_FETCH_ABORT,
  MESSAGING_FETCH_ERROR,
  MESSAGING_FETCH_REQUEST,
  MESSAGING_FETCH_REQUEST_BODY_CHUNK,
  MESSAGING_FETCH_REQUEST_BODY_DONE,
  MESSAGING_FETCH_RESPONSE,
  MESSAGING_FETCH_RESPONSE_BODY_CHUNK,
  MESSAGING_FETCH_RESPONSE_BODY_DONE,
} from "./message";
import {
  latin1ToBytes,
  streamToLatin1Generator,
  toJsError,
  toMessageError,
} from "./util";

export interface Port {
  postMessage(message: unknown): void;
  onMessage: (callback: (message: unknown) => void) => () => void;
}

export function createFetch(
  port: Port,
): typeof fetch & { _dispose: () => void } {
  const responseContextMap = new Map<
    string,
    {
      resolve: (value: Response) => void;
      reject: (reason?: unknown) => void;
    }
  >();
  const bodyStreamContextMap = new Map<
    string,
    | { chunks: string[]; done: boolean; error: MessageError | null }
    | { controller: ReadableStreamDefaultController<Uint8Array> }
  >();

  let nextId = 1;

  const dispose = port.onMessage((message) => {
    if (!isMessage(message)) {
      return;
    }

    switch (message.type) {
      case MESSAGING_FETCH_RESPONSE: {
        const context = responseContextMap.get(message.id);
        if (!context) {
          return;
        }
        responseContextMap.delete(message.id);

        try {
          const body =
            message.body == null
              ? message.body
              : typeof message.body === "string"
                ? message.body
                : new ReadableStream<Uint8Array>({
                    start(controller) {
                      const context = bodyStreamContextMap.get(message.id);
                      if (!context) {
                        controller.close();
                        return;
                      }
                      if ("chunks" in context) {
                        if (context.error != null) {
                          bodyStreamContextMap.delete(message.id);
                          controller.error(toJsError(context.error));
                          return;
                        }
                        context.chunks.forEach((chunk) => {
                          controller.enqueue(latin1ToBytes(chunk));
                        });
                        if (context.done) {
                          bodyStreamContextMap.delete(message.id);
                          controller.close();
                          return;
                        }
                      }
                      bodyStreamContextMap.set(message.id, { controller });
                    },
                  });
          const response = new Response(body, message.init);
          context.resolve(response);
        } catch (error) {
          context.reject(error);
        }

        break;
      }
      case MESSAGING_FETCH_RESPONSE_BODY_CHUNK: {
        const context = bodyStreamContextMap.get(message.id);
        if (!context) {
          return;
        }

        if ("chunks" in context) {
          context.chunks.push(message.chunk);
        } else {
          context.controller.enqueue(latin1ToBytes(message.chunk));
        }

        break;
      }
      case MESSAGING_FETCH_RESPONSE_BODY_DONE: {
        const context = bodyStreamContextMap.get(message.id);
        if (!context) {
          return;
        }

        if ("chunks" in context) {
          context.done = true;
        } else {
          bodyStreamContextMap.delete(message.id);
          context.controller.close();
        }

        break;
      }
      case MESSAGING_FETCH_ERROR: {
        {
          const context = responseContextMap.get(message.id);
          if (context) {
            responseContextMap.delete(message.id);
            bodyStreamContextMap.delete(message.id);

            context.reject(toJsError(message.error));
            return;
          }
        }

        {
          const context = bodyStreamContextMap.get(message.id);
          if (context) {
            if ("chunks" in context) {
              context.error = message.error;
            } else {
              bodyStreamContextMap.delete(message.id);
              context.controller.error(toJsError(message.error));
            }
            return;
          }
        }

        break;
      }
      default: {
        message satisfies
          | RequestMessage
          | RequestBodyChunkMessage
          | RequestBodyDoneMessage
          | AbortMessage;

        break;
      }
    }
  });

  async function messagingFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    const id = `${nextId}`;
    nextId += 1;

    const request = new Request(input, init);
    // TODO: handle more types of body
    const body =
      init?.body == null
        ? init?.body
        : typeof init.body === "string"
          ? init.body
          : true;
    const requestMessage: RequestMessage = {
      type: MESSAGING_FETCH_REQUEST,
      id,

      url: request.url,
      init: {
        ...init,
        body,
        headers: Array.from(request.headers.entries()),
      },
    };

    const signal = init?.signal;
    if (signal) {
      // TODO: handle removeEventListener
      signal.addEventListener("abort", () => {
        const abortMessage: AbortMessage = {
          type: MESSAGING_FETCH_ABORT,
          id,

          reason:
            signal.reason !== undefined
              ? toMessageError(signal.reason)
              : undefined,
        };
        port.postMessage(abortMessage);
      });
    }

    return new Promise<Response>((resolve, reject) => {
      responseContextMap.set(id, { resolve, reject });
      bodyStreamContextMap.set(id, { chunks: [], done: false, error: null });

      void (async () => {
        try {
          port.postMessage(requestMessage);

          if (body === true) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const generator = streamToLatin1Generator(request.body!);
            for await (const chunk of generator) {
              const chunkMessage: RequestBodyChunkMessage = {
                type: MESSAGING_FETCH_REQUEST_BODY_CHUNK,
                id,

                chunk,
              };
              port.postMessage(chunkMessage);
            }

            port.postMessage({
              type: MESSAGING_FETCH_REQUEST_BODY_DONE,
              id,
            });
          }
        } catch (error) {
          responseContextMap.delete(id);
          bodyStreamContextMap.delete(id);
          reject(error);
        }
      })();
    });
  }

  // FIXME: reject pending requests on dispose
  messagingFetch._dispose = () => {
    dispose();
    responseContextMap.clear();
    bodyStreamContextMap.clear();
  };
  return messagingFetch;
}

export function registerMessageHandler(port: Port): () => void {
  const requestContextMap = new Map<
    string,
    { abortController: AbortController }
  >();
  const bodyStreamContextMap = new Map<
    string,
    | { chunks: string[]; done: boolean; error: MessageError | null }
    | { controller: ReadableStreamDefaultController<Uint8Array> }
  >();

  const dispose = port.onMessage((message) => {
    if (!isMessage(message)) {
      return;
    }

    const id = message.id;

    switch (message.type) {
      case MESSAGING_FETCH_REQUEST: {
        const abortController = new AbortController();
        requestContextMap.set(id, { abortController });

        if (message.init.body === true) {
          bodyStreamContextMap.set(id, {
            chunks: [],
            done: false,
            error: null,
          });
        }

        void (async () => {
          try {
            const body =
              message.init.body !== true
                ? message.init.body
                : new ReadableStream<Uint8Array>({
                    start(controller) {
                      const context = bodyStreamContextMap.get(message.id);
                      if (!context) {
                        controller.close();
                        return;
                      }
                      if ("chunks" in context) {
                        if (context.error != null) {
                          bodyStreamContextMap.delete(message.id);
                          controller.error(toJsError(context.error));
                          return;
                        }
                        context.chunks.forEach((chunk) => {
                          controller.enqueue(latin1ToBytes(chunk));
                        });
                        if (context.done) {
                          bodyStreamContextMap.delete(message.id);
                          controller.close();
                          return;
                        }
                      }
                      bodyStreamContextMap.set(message.id, { controller });
                    },
                  });

            const response = await fetch(message.url, {
              ...message.init,
              body,
              signal: abortController.signal,
            });

            const responseMessage: ResponseMessage = {
              type: MESSAGING_FETCH_RESPONSE,
              id,

              body: response.body ? true : null,
              init: {
                status: response.status,
                statusText: response.statusText,
                headers: Array.from(response.headers.entries()),
              },
            };

            port.postMessage(responseMessage);

            if (response.body) {
              const generator = streamToLatin1Generator(response.body);
              for await (const chunk of generator) {
                const chunkMessage: ResponseBodyChunkMessage = {
                  type: MESSAGING_FETCH_RESPONSE_BODY_CHUNK,
                  id,

                  chunk,
                };
                port.postMessage(chunkMessage);
              }

              port.postMessage({
                type: MESSAGING_FETCH_RESPONSE_BODY_DONE,
                id,
              });
            }
          } catch (error) {
            port.postMessage({
              type: MESSAGING_FETCH_ERROR,
              id,

              error: toMessageError(error),
            });
          } finally {
            requestContextMap.delete(id);
            bodyStreamContextMap.delete(id);
          }
        })();

        break;
      }
      case MESSAGING_FETCH_REQUEST_BODY_CHUNK: {
        const context = bodyStreamContextMap.get(message.id);
        if (!context) {
          return;
        }

        if ("chunks" in context) {
          context.chunks.push(message.chunk);
        } else {
          context.controller.enqueue(latin1ToBytes(message.chunk));
        }

        break;
      }
      case MESSAGING_FETCH_REQUEST_BODY_DONE: {
        const context = bodyStreamContextMap.get(message.id);
        if (!context) {
          return;
        }

        if ("chunks" in context) {
          context.done = true;
        } else {
          bodyStreamContextMap.delete(message.id);
          context.controller.close();
        }

        break;
      }
      case MESSAGING_FETCH_ABORT: {
        const context = requestContextMap.get(message.id);
        if (!context) {
          return;
        }

        requestContextMap.delete(message.id);
        bodyStreamContextMap.delete(message.id);
        context.abortController.abort(
          message.reason !== undefined ? toJsError(message.reason) : undefined,
        );

        break;
      }
      default: {
        message satisfies
          | ResponseMessage
          | ResponseBodyChunkMessage
          | ResponseBodyDoneMessage
          | ErrorMessage;

        break;
      }
    }
  });

  return dispose;
}
