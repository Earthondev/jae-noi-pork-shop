import type { ReactNode, SVGProps } from "react";

export type AdminIconName =
  | "orders" | "calendar" | "products" | "store" | "external" | "logout"
  | "search" | "plus" | "edit" | "hide" | "up" | "down" | "check"
  | "chevron" | "image" | "phone" | "clock" | "money" | "close" | "grid" | "list" | "sort" | "menu" | "download" | "grip" | "printer"
  | "copy" | "tag" | "coins" | "package" | "bag" | "truck" | "fileText" | "filePdf" | "send" | "filter";

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
  download: <><path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M5 19h14"/></>,
  grip: <><circle cx="9" cy="6" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="6" r="1.4" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="9" cy="18" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="18" r="1.4" fill="currentColor" stroke="none"/></>,
  printer: <><path d="M6 9V4h12v5"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></>,
  copy: <><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/></>,
  tag: <><path d="m20.59 13.41-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></>,
  coins: <><ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.66 3.58 3 8 3s8-1.34 8-3V6"/><path d="M4 12v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6"/></>,
  package: <><path d="m16.5 9.4 4.5-2.8L12 2 3 6.6l4.5 2.8"/><path d="M3 6.6v10.8L12 22l9-4.6V6.6"/><path d="m12 12.8 9-4.6M12 12.8v9.2M12 12.8 3 8.2"/></>,
  bag: <><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></>,
  truck: <><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></>,
  fileText: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></>,
  filePdf: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M10 12h-1v6h1a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2z"/></>,
  send: <><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></>,
  filter: <path d="M3 4h18l-7 8v7l-4 2v-9z"/>,
};

export function AdminIcon({ name, ...props }: { name: AdminIconName } & SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>{paths[name]}</svg>;
}
