import { env, waitUntil } from "cloudflare:workers";
import {
  reportOperationalError,
  type MonitoringBindings,
  type OperationalErrorInput,
} from "./monitoring";

export function reportServerError(input: OperationalErrorInput): void {
  const promise = reportOperationalError(input, env as unknown as MonitoringBindings);
  try {
    waitUntil(promise);
  } catch {
    void promise;
  }
}
