"use client";

import Image from "next/image";
import { useState } from "react";

export function ProductGallery({ images, name }: { images: string[]; name: string }) {
  const [selected, setSelected] = useState(0);
  return <div className="pd-gallery">
    <div className="pd-photo"><Image src={images[selected] ?? images[0]} alt={`${name} รูปที่ ${selected + 1}`} fill priority sizes="(max-width: 720px) 100vw, 50vw" /></div>
    {images.length > 1 && <div className="pd-thumbnails" aria-label="เลือกรูปสินค้า">
      {images.map((src, index) => <button type="button" key={src} aria-label={`ดูรูปที่ ${index + 1} ของ ${name}`} aria-pressed={index === selected} onClick={() => setSelected(index)}>
        <Image src={src} alt="" width={64} height={64} />
      </button>)}
    </div>}
  </div>;
}
