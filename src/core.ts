import type {
  AbortMessage,
  ErrorMessage,
  RequestBodyChunkMessage,
  RequestBodyDoneMessage,
  RequestMessage,
  ResponseBodyChunkMessage,
  ResponseBodyDoneMessage,
  ResponseMessage,
} from "./message";
import {
  isMessageLike,
  MESSAGING_FETCH_ABORT,
  MESSAGING_FETCH_ERROR,
  MESSAGING_FETCH_REQUEST,
  MESSAGING_FETCH_REQUEST_BODY_CHUNK,
  MESSAGING_FETCH_REQUEST_BODY_DONE,
  MESSAGING_FETCH_RESPONSE,
  MESSAGING_FETCH_RESPONSE_BODY_CHUNK,
  MESSAGING_FETCH_RESPONSE_BODY_DONE,
} from "./message";
import { toJsError, toMessageError } from "./util";

export type DisposeFn = () => void;

export interface Port {
  postMessage(message: unknown): void;
  onMessage: (callback: (message: unknown) => void) => DisposeFn;
}

export function createFetch(
  port: Port,
): typeof globalThis.fetch & { _dispose: DisposeFn } {
  const responseContextMap = new Map<
    string,
    {
      resolve: (value: Response) => void;
      reject: (reason?: unknown) => void;
    }
  >();
  const bodyContextMap = new Map<
    string,
    { controller: ReadableStreamDefaultController<Uint8Array> }
  >();

  let nextId = 1;

  const dispose = port.onMessage((message) => {
    if (!isMessageLike(message)) {
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
            message.body === true
              ? new ReadableStream<Uint8Array>({
                  start(controller) {
                    bodyContextMap.set(message.id, { controller });
                  },
                })
              : message.body;
          const response = new Response(body, message.init);
          context.resolve(response);
        } catch (error) {
          context.reject(error);
        }

        break;
      }
      case MESSAGING_FETCH_RESPONSE_BODY_CHUNK: {
        const context = bodyContextMap.get(message.id);
        if (!context) {
          return;
        }

        context.controller.enqueue(Uint8Array.from(message.chunk));

        break;
      }
      case MESSAGING_FETCH_RESPONSE_BODY_DONE: {
        const context = bodyContextMap.get(message.id);
        if (!context) {
          return;
        }
        bodyContextMap.delete(message.id);

        context.controller.close();

        break;
      }
      case MESSAGING_FETCH_ERROR: {
        const responseContext = responseContextMap.get(message.id);
        if (responseContext) {
          responseContextMap.delete(message.id);
          responseContext.reject(toJsError(message.error));
        }

        const bodyContext = bodyContextMap.get(message.id);
        if (bodyContext) {
          bodyContextMap.delete(message.id);
          bodyContext.controller.error(toJsError(message.error));
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
    const body = init?.body != null ? true : init?.body;
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
      Promise.resolve()
        .then(async () => {
          port.postMessage(requestMessage);

          if (body === true) {
            const reader = request.body?.getReader();
            while (reader) {
              const { done, value } = await reader.read();
              if (done) {
                break;
              }
              const chunkMessage: RequestBodyChunkMessage = {
                type: MESSAGING_FETCH_REQUEST_BODY_CHUNK,
                id,

                chunk: Array.from(value),
              };
              port.postMessage(chunkMessage);
            }

            port.postMessage({
              type: MESSAGING_FETCH_REQUEST_BODY_DONE,
              id,
            });
          }
        })
        .catch((error: unknown) => {
          responseContextMap.delete(id);
          reject(error);
        });
    });
  }

  // FIXME: reject pending requests on dispose
  messagingFetch._dispose = () => {
    dispose();
    responseContextMap.clear();
    bodyContextMap.clear();
  };
  return messagingFetch;
}

export function registerMessageHandler(
  port: Port,
  options?: { fetch?: typeof globalThis.fetch },
): DisposeFn {
  const fetch = options?.fetch ?? globalThis.fetch;

  const requestContextMap = new Map<
    string,
    { abortController: AbortController }
  >();
  const bodyContextMap = new Map<
    string,
    { controller: ReadableStreamDefaultController<Uint8Array> }
  >();

  const dispose = port.onMessage((message) => {
    if (!isMessageLike(message)) {
      return;
    }

    switch (message.type) {
      case MESSAGING_FETCH_REQUEST: {
        const id = message.id;

        const abortController = new AbortController();
        requestContextMap.set(id, { abortController });

        const body =
          message.init.body === true
            ? new ReadableStream<Uint8Array>({
                start(controller) {
                  bodyContextMap.set(id, { controller });
                },
              })
            : message.init.body;

        Promise.resolve()
          .then(async () => {
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
              const reader = response.body.getReader();
              while (reader) {
                const { done, value } = await reader.read();
                if (done) {
                  break;
                }
                const chunkMessage: ResponseBodyChunkMessage = {
                  type: MESSAGING_FETCH_RESPONSE_BODY_CHUNK,
                  id,

                  chunk: Array.from(value),
                };
                port.postMessage(chunkMessage);
              }

              port.postMessage({
                type: MESSAGING_FETCH_RESPONSE_BODY_DONE,
                id,
              });
            }
          })
          .catch((error: unknown) => {
            port.postMessage({
              type: MESSAGING_FETCH_ERROR,
              id,

              error: toMessageError(error),
            });
          })
          .finally(() => {
            requestContextMap.delete(id);
            bodyContextMap.delete(id);
          });

        break;
      }
      case MESSAGING_FETCH_REQUEST_BODY_CHUNK: {
        const context = bodyContextMap.get(message.id);
        if (!context) {
          return;
        }

        context.controller.enqueue(Uint8Array.from(message.chunk));

        break;
      }
      case MESSAGING_FETCH_REQUEST_BODY_DONE: {
        const context = bodyContextMap.get(message.id);
        if (!context) {
          return;
        }
        bodyContextMap.delete(message.id);

        context.controller.close();

        break;
      }
      case MESSAGING_FETCH_ABORT: {
        const context = requestContextMap.get(message.id);
        if (!context) {
          return;
        }
        requestContextMap.delete(message.id);
        bodyContextMap.delete(message.id);

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
