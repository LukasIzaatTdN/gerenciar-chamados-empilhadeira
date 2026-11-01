import type { SVGProps } from "react";

const paths = {
  overview: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  company: "M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16 M16 9h2a2 2 0 0 1 2 2v10 M2 21h20 M8 7h4 M8 11h4 M8 15h4 M9 21v-3h2v3",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M16 3a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  subscription: "M3 5h18v14H3z M3 9h18 M7 14h4",
  audit: "M8 3h8v4H8z M8 5H5v16h14V5h-3 M8 12h8 M8 16h5",
  user: "M20 21v-2a7 7 0 0 0-14 0v2 M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  sun: "M12 3V1 M12 23v-2 M3 12H1 M23 12h-2 M5.64 5.64 4.22 4.22 M19.78 19.78l-1.42-1.42 M5.64 18.36l-1.42 1.42 M19.78 4.22l-1.42 1.42 M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0",
  moon: "M20.9 13a9 9 0 1 1-9.9-9.9 7 7 0 0 0 9.9 9.9",
  plus: "M12 5v14 M5 12h14",
  search: "M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  close: "M6 6l12 12 M6 18 18 6",
  edit: "m16 3 5 5 M3 21l5-1L21 7a2.12 2.12 0 0 0-4-4L4 16z",
  more: "M5 12h.01 M12 12h.01 M19 12h.01",
  arrow: "M5 12h14 M13 6l6 6-6 6",
  chevron: "m9 5 7 7-7 7",
  units: "M3 21V8l9-5 9 5v13 M3 9h18 M7 13h10v8 M10 13v8 M14 13v8 M1 21h22",
  support: "M12 17v4 M8 21h8 M3 3h18v14H3z M7 8h3 M7 12h7",
  clock: "M12 8v4l3 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  check: "m8 12 3 3 5-6 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  alert: "M12 9v4 M12 17h.01 M10.3 3.9 1.8 18.6A1.6 1.6 0 0 0 3.2 21h17.6a1.6 1.6 0 0 0 1.4-2.4L13.7 3.9a2 2 0 0 0-3.4 0",
  forklift: "M3 17V9h5l3 4v4 M3 13h8 M8 9V4H4 M16 3v16h6 M19 3v13h3 M7 19a2 2 0 1 1-4 0 2 2 0 0 1 4 0 M14 19a2 2 0 1 1-4 0 2 2 0 0 1 4 0",
  box: "m3 7 9-5 9 5v10l-9 5-9-5z M3 7l9 5 9-5 M12 12v10 M7.5 4.5l9 5",
  logout: "M9 3H4v18h5 M10 12h12 M18 8l4 4-4 4",
  settings: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z",
  chart: "M4 3v18h17 M8 16v-4 M13 16V8 M18 16v-7",
  location: "M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0 M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
} as const;

export type AdminIconName = keyof typeof paths;

export default function AdminIcon({ name, ...props }: SVGProps<SVGSVGElement> & { name: AdminIconName }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>
      <path d={paths[name]} />
    </svg>
  );
}
