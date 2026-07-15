import thaiAddresses from "../public/data/thai-addresses.json";
import type { StructuredThaiAddress } from "./thai-address";

type CompactSubdistrict = [name: string, postalCode: string];
type CompactDistrict = { n: string; s: CompactSubdistrict[] };
type CompactProvince = { n: string; d: CompactDistrict[] };

const addressData = thaiAddresses as CompactProvince[];

export function isValidStructuredThaiAddress(address: StructuredThaiAddress): boolean {
  if (!address.addressLine.trim() || !/^\d{5}$/.test(address.postalCode)) return false;
  const province = addressData.find((candidate) => candidate.n === address.province);
  const district = province?.d.find((candidate) => candidate.n === address.district);
  const subdistrict = district?.s.find(([name]) => name === address.subdistrict);
  return subdistrict?.[1] === address.postalCode;
}
