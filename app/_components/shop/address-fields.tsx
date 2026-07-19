"use client";

import { useEffect, useMemo, useState } from "react";

type CompactSubdistrict = [name: string, postalCode: string];
type CompactDistrict = { n: string; s: CompactSubdistrict[] };
type CompactProvince = { n: string; d: CompactDistrict[] };

export type AddressFieldName = "addressLine" | "subdistrict" | "district" | "province" | "postalCode";

type AddressFieldsProps = Readonly<{
  values: Readonly<Record<AddressFieldName, string>>;
  onChange: (field: AddressFieldName, value: string) => void;
}>;

let cachedAddressData: CompactProvince[] | null = null;

export function AddressFields({ values, onChange }: AddressFieldsProps) {
  const [data, setData] = useState<CompactProvince[]>(cachedAddressData ?? []);
  const [loading, setLoading] = useState(cachedAddressData === null);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    if (cachedAddressData) return;
    const controller = new AbortController();
    void fetch("/data/thai-addresses.json", { cache: "force-cache", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("โหลดข้อมูลที่อยู่ไม่สำเร็จ");
        return response.json() as Promise<CompactProvince[]>;
      })
      .then((result) => {
        cachedAddressData = result;
        setData(result);
        setLoadError(false);
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setLoadError(true);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [loadAttempt]);

  function retryLoad() {
    setLoadError(false);
    setLoading(true);
    setLoadAttempt((attempt) => attempt + 1);
  }

  const province = useMemo(() => data.find((candidate) => candidate.n === values.province), [data, values.province]);
  const district = useMemo(() => province?.d.find((candidate) => candidate.n === values.district), [province, values.district]);
  const bangkok = values.province === "กรุงเทพมหานคร";

  return (
    <fieldset className="structured-address full">
      <legend>ที่อยู่จัดส่ง</legend>
      <label className="full">บ้านเลขที่ หมู่บ้าน อาคาร ถนน
        <textarea name="addressLine" required autoComplete="address-line1" rows={2} placeholder="เช่น 99 หมู่ 1 ถนนมิตรภาพ" value={values.addressLine} onChange={(event) => onChange("addressLine", event.target.value)} />
      </label>
      <label>จังหวัด
        <select name="province" required autoComplete="address-level1" value={values.province} disabled={loading || loadError} onChange={(event) => {
          onChange("province", event.target.value);
          onChange("district", "");
          onChange("subdistrict", "");
          onChange("postalCode", "");
        }}>
          <option value="">{loading ? "กำลังโหลดจังหวัด..." : loadError ? "โหลดข้อมูลไม่สำเร็จ" : "เลือกจังหวัด"}</option>
          {data.map((candidate) => <option value={candidate.n} key={candidate.n}>{candidate.n}</option>)}
        </select>
      </label>
      <label>{bangkok ? "เขต" : "อำเภอ"}
        <select name="district" required autoComplete="address-level2" value={values.district} disabled={!province} onChange={(event) => {
          onChange("district", event.target.value);
          onChange("subdistrict", "");
          onChange("postalCode", "");
        }}>
          <option value="">เลือก{bangkok ? "เขต" : "อำเภอ"}</option>
          {province?.d.map((candidate) => <option value={candidate.n} key={candidate.n}>{candidate.n}</option>)}
        </select>
      </label>
      <label>{bangkok ? "แขวง" : "ตำบล"}
        <select name="subdistrict" required autoComplete="address-level3" value={values.subdistrict} disabled={!district} onChange={(event) => {
          const subdistrict = district?.s.find(([name]) => name === event.target.value);
          onChange("subdistrict", event.target.value);
          onChange("postalCode", subdistrict?.[1] ?? "");
        }}>
          <option value="">เลือก{bangkok ? "แขวง" : "ตำบล"}</option>
          {district?.s.map(([name, postalCode]) => <option value={name} key={`${name}-${postalCode}`}>{name}</option>)}
        </select>
      </label>
      <label>รหัสไปรษณีย์
        <input name="postalCode" required inputMode="numeric" autoComplete="postal-code" pattern="[0-9]{5}" maxLength={5} placeholder="รหัส 5 หลัก" value={values.postalCode} onChange={(event) => onChange("postalCode", event.target.value.replace(/\D/g, "").slice(0, 5))} />
      </label>
      {loadError && (
        <p className="address-load-error full" role="alert">
          โหลดรายชื่อที่อยู่ไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง
          <button type="button" className="address-load-retry" onClick={retryLoad}>ลองโหลดใหม่</button>
        </p>
      )}
    </fieldset>
  );
}
