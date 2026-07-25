import assert from "node:assert/strict";
import test from "node:test";
import {
  MalformedRequestBodyError,
  parseBoundedFormData,
  parseBoundedJson,
  readBoundedRequestBody,
  RequestBodyTooLargeError,
  UnsupportedRequestContentTypeError,
} from "../lib/request-body.ts";

test("rejects a declared oversized request before reading its body", async () => {
  const request = new Request("https://example.test/api", {
    method: "POST",
    headers: { "Content-Length": "1000" },
    body: "small",
  });
  await assert.rejects(readBoundedRequestBody(request, 100), RequestBodyTooLargeError);
});

test("rejects a chunked body as soon as it exceeds the byte limit", async () => {
  const request = new Request("https://example.test/api", {
    method: "POST",
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(60));
        controller.enqueue(new Uint8Array(60));
        controller.close();
      },
    }),
    duplex: "half",
  });
  await assert.rejects(readBoundedRequestBody(request, 100), RequestBodyTooLargeError);
});

test("parses only valid bounded JSON with the correct media type", async () => {
  const valid = new Request("https://example.test/api", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ ok: true }),
  });
  assert.deepEqual(await parseBoundedJson(valid, 100), { ok: true });

  const wrongType = new Request("https://example.test/api", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: "{}",
  });
  await assert.rejects(parseBoundedJson(wrongType, 100), UnsupportedRequestContentTypeError);

  const malformed = new Request("https://example.test/api", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{",
  });
  await assert.rejects(parseBoundedJson(malformed, 100), MalformedRequestBodyError);
});

test("reconstructs bounded multipart form data", async () => {
  const source = new FormData();
  source.set("name", "เจ๊น้อย");
  const original = new Request("https://example.test/api", { method: "POST", body: source });
  const parsed = await parseBoundedFormData(original, 10_000);
  assert.equal(parsed.get("name"), "เจ๊น้อย");
});
