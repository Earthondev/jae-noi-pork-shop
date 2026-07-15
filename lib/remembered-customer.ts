export const REMEMBERED_CUSTOMERS_STORAGE_KEY = "jae_noi_remembered_customers_v1";
export const REMEMBERED_CUSTOMER_TTL_MS = 180 * 24 * 60 * 60 * 1000;

const MAX_REMEMBERED_CUSTOMERS = 5;

export type RememberedCustomer = Readonly<{
  customerName: string;
  phone: string;
  address: string;
  addressLine: string;
  subdistrict: string;
  district: string;
  province: string;
  postalCode: string;
  updatedAt: number;
  expiresAt: number;
}>;

type CustomerStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type StoredCustomers = Readonly<{
  version: 1;
  customers: readonly RememberedCustomer[];
}>;

export function normalizeCustomerPhone(value: string): string {
  return value.replace(/\D/g, "");
}

export function readRememberedCustomer(
  storage: CustomerStorage | null,
  phone: string,
  now = Date.now(),
): RememberedCustomer | null {
  const normalizedPhone = normalizeCustomerPhone(phone);
  if (!/^0\d{8,9}$/.test(normalizedPhone)) return null;
  return readValidCustomers(storage, now).find((customer) => customer.phone === normalizedPhone) ?? null;
}

export function saveRememberedCustomer(
  storage: CustomerStorage | null,
  input: { customerName: string; phone: string; address: string; addressLine?: string; subdistrict?: string; district?: string; province?: string; postalCode?: string },
  now = Date.now(),
): boolean {
  if (!storage) return false;
  const phone = normalizeCustomerPhone(input.phone);
  const customerName = cleanText(input.customerName, 100).trim();
  const address = cleanText(input.address, 1_000).trim();
  const addressLine = cleanText(input.addressLine ?? address, 500).trim();
  const subdistrict = cleanText(input.subdistrict ?? "", 100).trim();
  const district = cleanText(input.district ?? "", 100).trim();
  const province = cleanText(input.province ?? "", 100).trim();
  const postalCode = (input.postalCode ?? "").replace(/\D/g, "").slice(0, 5);
  if (!/^0\d{8,9}$/.test(phone) || !customerName) return false;

  try {
    const customers = readValidCustomers(storage, now).filter((customer) => customer.phone !== phone);
    const next: StoredCustomers = {
      version: 1,
      customers: [{ customerName, phone, address, addressLine, subdistrict, district, province, postalCode, updatedAt: now, expiresAt: now + REMEMBERED_CUSTOMER_TTL_MS }, ...customers]
        .slice(0, MAX_REMEMBERED_CUSTOMERS),
    };
    storage.setItem(REMEMBERED_CUSTOMERS_STORAGE_KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

export function forgetRememberedCustomer(storage: CustomerStorage | null, phone: string, now = Date.now()): boolean {
  if (!storage) return false;
  const normalizedPhone = normalizeCustomerPhone(phone);
  try {
    const customers = readValidCustomers(storage, now).filter((customer) => customer.phone !== normalizedPhone);
    if (customers.length === 0) storage.removeItem(REMEMBERED_CUSTOMERS_STORAGE_KEY);
    else storage.setItem(REMEMBERED_CUSTOMERS_STORAGE_KEY, JSON.stringify({ version: 1, customers } satisfies StoredCustomers));
    return true;
  } catch {
    return false;
  }
}

export function browserCustomerStorage(): CustomerStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readValidCustomers(storage: CustomerStorage | null, now: number): RememberedCustomer[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(REMEMBERED_CUSTOMERS_STORAGE_KEY);
    if (!raw) return [];
    const value = JSON.parse(raw) as Partial<StoredCustomers>;
    if (value.version !== 1 || !Array.isArray(value.customers)) {
      storage.removeItem(REMEMBERED_CUSTOMERS_STORAGE_KEY);
      return [];
    }
    const customers = value.customers.flatMap((candidate) => sanitizeCustomer(candidate, now)).slice(0, MAX_REMEMBERED_CUSTOMERS);
    if (customers.length === 0) storage.removeItem(REMEMBERED_CUSTOMERS_STORAGE_KEY);
    return customers;
  } catch {
    return [];
  }
}

function sanitizeCustomer(value: unknown, now: number): RememberedCustomer[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const candidate = value as Partial<RememberedCustomer>;
  const phone = normalizeCustomerPhone(typeof candidate.phone === "string" ? candidate.phone : "");
  const customerName = cleanText(typeof candidate.customerName === "string" ? candidate.customerName : "", 100).trim();
  const address = cleanText(typeof candidate.address === "string" ? candidate.address : "", 1_000).trim();
  const addressLine = cleanText(typeof candidate.addressLine === "string" ? candidate.addressLine : address, 500).trim();
  const subdistrict = cleanText(typeof candidate.subdistrict === "string" ? candidate.subdistrict : "", 100).trim();
  const district = cleanText(typeof candidate.district === "string" ? candidate.district : "", 100).trim();
  const province = cleanText(typeof candidate.province === "string" ? candidate.province : "", 100).trim();
  const postalCode = (typeof candidate.postalCode === "string" ? candidate.postalCode : "").replace(/\D/g, "").slice(0, 5);
  if (!/^0\d{8,9}$/.test(phone) || !customerName || typeof candidate.updatedAt !== "number" || typeof candidate.expiresAt !== "number" || candidate.expiresAt <= now) return [];
  return [{ customerName, phone, address, addressLine, subdistrict, district, province, postalCode, updatedAt: candidate.updatedAt, expiresAt: candidate.expiresAt }];
}

function cleanText(value: string, maxLength: number): string {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").slice(0, maxLength);
}
