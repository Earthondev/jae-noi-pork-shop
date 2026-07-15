"use client";

import { SystemUnavailable } from "./_components/system-unavailable";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="th">
      <body><SystemUnavailable digest={error.digest} global reset={reset} /></body>
    </html>
  );
}
