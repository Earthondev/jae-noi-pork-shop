import type { ReactNode, SVGProps } from "react";

export type AdminIconName =
  | "orders" | "calendar" | "products" | "store" | "external" | "logout"
  | "search" | "plus" | "edit" | "hide" | "up" | "down" | "check"
  | "chevron" | "image" | "phone" | "clock" | "money" | "close" | "grid" | "list" | "sort" | "menu";

const paths: Record<AdminIconName, ReactNode> = {
  menu: <path d="M3 12h18M3 6h18M3 18h18"/>,
  sort: <path d="m15 4 5-5 5 5M20 3v18M9 20l-5 5-5-5M4 21V3"/>,
  orders: <><path d="M6 3h12v18H6z"/><path d="M9 7h6M9 11h6M9 15h4"/></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></>,
  products: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="m4.5 7.5 7.5 4 7.5-4M12 11.5V21"/></>,
  store: <><path d="M4 10v11h16V10M3 10l2-6h14l2 6"/><path d="M3 10a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0M9 21v-6h6v6"/></>,
  external: <><path d="M14 4h6v6M20 4l-9 9"/><path d="M19 13v7H4V5h7"/></>,
  logout: <><path d="M10 5H4v14h6M14 8l4 4-4 4M18 12H8"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
  plus: <path d="M12 5v14M5 12h14"/>,
  edit: <><path d="m4 20 4.5-1 10-10-3.5-3.5-10 10zM13.5 7l3.5 3.5"/></>,
  hide: <><path d="M3 3l18 18M10.5 10.5a2 2 0 0 0 3 3"/><path d="M9.8 5.2A10.6 10.6 0 0 1 12 5c5 0 9 7 9 7a16 16 0 0 1-2.1 2.8M6.6 6.6C4.4 8 3 12 3 12s4 7 9 7c1 0 2-.3 2.9-.7"/></>,
  up: <path d="m7 14 5-5 5 5"/>,
  down: <path d="m7 10 5 5 5-5"/>,
  check: <path d="m5 12 4 4L19 6"/>,
  chevron: <path d="m9 7 5 5-5 5"/>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 20"/></>,
  phone: <path d="M7 3H4a1 1 0 0 0-1 1c0 9.4 7.6 17 17 17a1 1 0 0 0 1-1v-3l-4-2-2 2c-3.7-1.6-6.4-4.3-8-8l2-2z"/>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  money: <><rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M7 9H5v2M17 15h2v-2"/></>,
  close: <path d="m6 6 12 12M18 6 6 18"/>,
  grid: <><rect x="4" y="4" width="6" height="6"/><rect x="14" y="4" width="6" height="6"/><rect x="4" y="14" width="6" height="6"/><rect x="14" y="14" width="6" height="6"/></>,
  list: <><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="5" cy="6" r="1"/><circle cx="5" cy="12" r="1"/><circle cx="5" cy="18" r="1"/></>,
};

export function AdminIcon({ name, ...props }: { name: AdminIconName } & SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>{paths[name]}</svg>;
}
