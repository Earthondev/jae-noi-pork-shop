import { NextResponse } from "next/server";
import { isSameOriginMutation } from "../../../../lib/admin-auth";
import { reportServerError } from "../../../../lib/server-monitoring";
import { MalformedRequestBodyError, parseBoundedJson, RequestBodyTooLargeError, UnsupportedRequestContentTypeError } from "../../../../lib/request-body";

const MAX_BODY_BYTES = 2_048;

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return new NextResponse(null, { status: 403 });
  let body: Record<string, unknown> | null;
  try {
    body = await parseBoundedJson(request, MAX_BODY_BYTES) as Record<string, unknown> | null;
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return new NextResponse(null, { status: 413 });
    if (error instanceof UnsupportedRequestContentTypeError || error instanceof MalformedRequestBodyError) {
      return new NextResponse(null, { status: 400 });
    }
    throw error;
  }
  const kind = body?.kind === "global-error" ? "global-error" : body?.kind === "route-error" ? "route-error" : null;
  if (!kind) return new NextResponse(null, { status: 400 });
  const digest = typeof body?.digest === "string" && /^[A-Za-z0-9_.:-]{1,100}$/.test(body.digest)
    ? body.digest
    : "missing";
  const path = typeof body?.path === "string" ? body.path.slice(0, 200) : "/";

  const renderError = new Error();
  renderError.name = kind === "global-error" ? "GlobalRenderError" : "RouteRenderError";
  reportServerError({
    event: "client_render_failed",
    operation: `client.render.${kind}`,
    error: renderError,
    path,
    method: "GET",
    tags: { digest },
  });
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
