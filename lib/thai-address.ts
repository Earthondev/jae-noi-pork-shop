export type StructuredThaiAddress = Readonly<{
  addressLine: string;
  subdistrict: string;
  district: string;
  province: string;
  postalCode: string;
}>;

export function formatThaiAddress(address: StructuredThaiAddress): string {
  const bangkok = address.province === "กรุงเทพมหานคร";
  return [
    address.addressLine.trim(),
    address.subdistrict.trim() ? `${bangkok ? "แขวง" : "ต."}${address.subdistrict.trim()}` : "",
    address.district.trim() ? `${bangkok ? "เขต" : "อ."}${address.district.trim()}` : "",
    address.province.trim() ? `${bangkok ? "" : "จ."}${address.province.trim()}` : "",
    address.postalCode.trim(),
  ].filter(Boolean).join(" ");
}
