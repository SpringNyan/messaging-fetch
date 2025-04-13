export const MESSAGING_FETCH_REQUEST = "MESSAGING_FETCH_REQUEST";
export const MESSAGING_FETCH_REQUEST_BODY_CHUNK =
  "MESSAGING_FETCH_REQUEST_BODY_CHUNK";
export const MESSAGING_FETCH_REQUEST_BODY_DONE =
  "MESSAGING_FETCH_REQUEST_BODY_DONE";
export const MESSAGING_FETCH_RESPONSE = "MESSAGING_FETCH_RESPONSE";
export const MESSAGING_FETCH_RESPONSE_BODY_CHUNK =
  "MESSAGING_FETCH_RESPONSE_BODY_CHUNK";
export const MESSAGING_FETCH_RESPONSE_BODY_DONE =
  "MESSAGING_FETCH_RESPONSE_BODY_DONE";
export const MESSAGING_FETCH_ABORT = "MESSAGING_FETCH_ABORT";
export const MESSAGING_FETCH_ERROR = "MESSAGING_FETCH_ERROR";

export interface MessageError {
  name: string;
  message: string;
}

export interface BaseMessage<TType extends string> {
  type: TType;
  id: string;
}

export interface RequestMessage
  extends BaseMessage<typeof MESSAGING_FETCH_REQUEST> {
  url: string;
  init: {
    body?: string | true | null;
    cache?: RequestCache;
    credentials?: RequestCredentials;
    headers?: [string, string][];
    integrity?: string;
    keepalive?: boolean;
    method?: string;
    mode?: RequestMode;
    priority?: RequestPriority;
    redirect?: RequestRedirect;
    referrer?: string;
    referrerPolicy?: ReferrerPolicy;
  };
}

export interface RequestBodyChunkMessage
  extends BaseMessage<typeof MESSAGING_FETCH_REQUEST_BODY_CHUNK> {
  chunk: string;
}

export interface RequestBodyDoneMessage
  extends BaseMessage<typeof MESSAGING_FETCH_REQUEST_BODY_DONE> {}

export interface ResponseMessage
  extends BaseMessage<typeof MESSAGING_FETCH_RESPONSE> {
  body: string | true | null;
  init: {
    headers?: [string, string][];
    status?: number;
    statusText?: string;
  };
}

export interface ResponseBodyChunkMessage
  extends BaseMessage<typeof MESSAGING_FETCH_RESPONSE_BODY_CHUNK> {
  chunk: string;
}

export interface ResponseBodyDoneMessage
  extends BaseMessage<typeof MESSAGING_FETCH_RESPONSE_BODY_DONE> {}

export interface AbortMessage
  extends BaseMessage<typeof MESSAGING_FETCH_ABORT> {
  reason?: MessageError;
}

export interface ErrorMessage
  extends BaseMessage<typeof MESSAGING_FETCH_ERROR> {
  error: MessageError;
}

export type Message =
  | RequestMessage
  | RequestBodyChunkMessage
  | RequestBodyDoneMessage
  | ResponseMessage
  | ResponseBodyChunkMessage
  | ResponseBodyDoneMessage
  | AbortMessage
  | ErrorMessage;

export function isMessage(value: unknown): value is Message;
export function isMessage<TType extends Message["type"]>(
  value: unknown,
  type: TType,
): value is Extract<Message, { type: TType }>;
export function isMessage(value: unknown, type?: string): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    (type === undefined || value.type === type)
  );
}
