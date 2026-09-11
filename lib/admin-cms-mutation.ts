export const ADMIN_CMS_MUTATION_ERROR_CODES = {
  duplicate: "DUPLICATE",
  conflict: "CONFLICT",
} as const;

export function isRetryableAdminCmsConflict(status: number, value: unknown): boolean {
  if (status !== 409 || !value || typeof value !== "object" || Array.isArray(value)) return false;
  return (value as { code?: unknown }).code === ADMIN_CMS_MUTATION_ERROR_CODES.conflict;
}
