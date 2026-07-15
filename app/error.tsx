"use client";

import { SystemUnavailable } from "./_components/system-unavailable";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <SystemUnavailable digest={error.digest} reset={reset} />;
}
