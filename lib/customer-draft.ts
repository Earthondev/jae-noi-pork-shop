export const CHECKOUT_DRAFT_STORAGE_KEY = "jae_noi_checkout_draft_v1";
export const CHECKOUT_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

export type DraftFulfilment = "pickup" | "postal";
export type DraftQuantities = Record<string, number>;

export type CheckoutDraft = {
  quantities: DraftQuantities;
  customerName: string;
  phone: string;
  address: string;
  note: string;
  fulfilment: DraftFulfilment;
  selectedRound: string;
};

type StoredCheckoutDraft = CheckoutDraft & {
  version: 1;
  expiresAt: number;
};

export type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type DraftCatalogProduct = {
  id: string;
  name: string;
  price: number | null;
  status: string;
};

export const EMPTY_CHECKOUT_DRAFT: CheckoutDraft = {
  quantities: {},
  customerName: "",
  phone: "",
  address: "",
  note: "",
  fulfilment: "postal",
  selectedRound: "",
};

export function readCheckoutDraft(storage: DraftStorage | null, now = Date.now()): CheckoutDraft | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(CHECKOUT_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = parseStoredDraft(JSON.parse(raw), now);
    if (!parsed) storage.removeItem(CHECKOUT_DRAFT_STORAGE_KEY);
    return parsed;
  } catch {
    return null;
  }
}

export function writeCheckoutDraft(storage: DraftStorage | null, draft: CheckoutDraft, now = Date.now()): boolean {
  if (!storage) return false;
  try {
    if (!hasCheckoutDraftContent(draft)) {
      storage.removeItem(CHECKOUT_DRAFT_STORAGE_KEY);
      return true;
    }
    const stored: StoredCheckoutDraft = {
      version: 1,
      expiresAt: now + CHECKOUT_DRAFT_TTL_MS,
      ...sanitizeDraft(draft),
    };
    storage.setItem(CHECKOUT_DRAFT_STORAGE_KEY, JSON.stringify(stored));
    return true;
  } catch {
    return false;
  }
}

export function clearCheckoutDraft(storage: DraftStorage | null): boolean {
  if (!storage) return false;
  try {
    storage.removeItem(CHECKOUT_DRAFT_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function browserDraftStorage(): DraftStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function hasCheckoutDraftContent(draft: CheckoutDraft): boolean {
  return Object.keys(draft.quantities).length > 0 || Boolean(
    draft.customerName || draft.phone || draft.address || draft.note,
  );
}

export function reconcileDraftQuantities(
  quantities: DraftQuantities,
  products: readonly DraftCatalogProduct[],
): { quantities: DraftQuantities; unavailableNames: string[] } {
  const productsById = new Map(products.map((product) => [product.id, product]));
  const next: DraftQuantities = {};
  const unavailableNames: string[] = [];

  for (const [productId, quantity] of Object.entries(sanitizeQuantities(quantities))) {
    const product = productsById.get(productId);
    if (!product) continue; // A physically deleted row is removed silently.
    if (product.status === "เปิดขาย" && product.price !== null && product.price > 0) {
      next[productId] = quantity;
    } else {
      unavailableNames.push(product.name);
    }
  }

  return { quantities: next, unavailableNames };
}

function parseStoredDraft(value: unknown, now: number): CheckoutDraft | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const stored = value as Partial<StoredCheckoutDraft>;
  if (stored.version !== 1 || typeof stored.expiresAt !== "number" || stored.expiresAt <= now) return null;
  return sanitizeDraft({
    quantities: stored.quantities ?? {},
    customerName: typeof stored.customerName === "string" ? stored.customerName : "",
    phone: typeof stored.phone === "string" ? stored.phone : "",
    address: typeof stored.address === "string" ? stored.address : "",
    note: typeof stored.note === "string" ? stored.note : "",
    fulfilment: stored.fulfilment === "pickup" ? "pickup" : "postal",
    selectedRound: typeof stored.selectedRound === "string" ? stored.selectedRound : "",
  });
}

function sanitizeDraft(draft: CheckoutDraft): CheckoutDraft {
  return {
    quantities: sanitizeQuantities(draft.quantities),
    customerName: cleanText(draft.customerName, 100),
    phone: cleanText(draft.phone, 30),
    address: cleanText(draft.address, 1_000),
    note: cleanText(draft.note, 500),
    fulfilment: draft.fulfilment === "pickup" ? "pickup" : "postal",
    selectedRound: /^RD-\d{8}$/.test(draft.selectedRound) ? draft.selectedRound : "",
  };
}

function sanitizeQuantities(value: unknown): DraftQuantities {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: DraftQuantities = {};
  for (const [productId, rawQuantity] of Object.entries(value)) {
    if (!/^[A-Za-z0-9_-]{2,40}$/.test(productId)) continue;
    const quantity = Number(rawQuantity);
    if (Number.isInteger(quantity) && quantity > 0) result[productId] = Math.min(quantity, 99);
  }
  return result;
}

function cleanText(value: string, maxLength: number): string {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").slice(0, maxLength);
}
