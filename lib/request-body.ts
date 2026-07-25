export class RequestBodyTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super(`Request body exceeds ${maxBytes} bytes`);
    this.name = "RequestBodyTooLargeError";
  }
}

export class UnsupportedRequestContentTypeError extends Error {
  constructor(readonly contentType: string) {
    super(`Unsupported request content type: ${contentType || "(missing)"}`);
    this.name = "UnsupportedRequestContentTypeError";
  }
}

export class MalformedRequestBodyError extends Error {
  constructor() {
    super("Malformed request body");
    this.name = "MalformedRequestBodyError";
  }
}

function declaredContentLength(request: Request): number | null {
  const raw = request.headers.get("content-length");
  if (raw === null) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export async function readBoundedRequestBody(request: Request, maxBytes: number): Promise<Uint8Array> {
  const declaredLength = declaredContentLength(request);
  if (declaredLength !== null && declaredLength > maxBytes) throw new RequestBodyTooLargeError(maxBytes);
  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel("request body too large").catch(() => undefined);
        throw new RequestBodyTooLargeError(maxBytes);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function parseBoundedJson(request: Request, maxBytes: number): Promise<unknown> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() ?? "";
  if (contentType !== "application/json") throw new UnsupportedRequestContentTypeError(contentType);
  const bytes = await readBoundedRequestBody(request, maxBytes);
  if (bytes.byteLength === 0) return null;
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new MalformedRequestBodyError();
  }
}

export async function parseBoundedFormData(request: Request, maxBytes: number): Promise<FormData> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data;")) {
    throw new UnsupportedRequestContentTypeError(contentType);
  }
  const bytes = await readBoundedRequestBody(request, maxBytes);
  try {
    return await new Response(toOwnedArrayBuffer(bytes), { headers: { "Content-Type": contentType } }).formData();
  } catch {
    throw new MalformedRequestBodyError();
  }
}

export function toOwnedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
