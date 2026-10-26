import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 20, children, strokeWidth = 1.8, ...rest }: P) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...rest}>
      {children}
    </svg>
  );
}

export const IconBook = (p: P) => (
  <Svg {...p}>
    <path d="M3 5.5h6a3 3 0 0 1 3 3V20a2 2 0 0 0-2-2H3z" />
    <path d="M21 5.5h-6a3 3 0 0 0-3 3V20a2 2 0 0 1 2-2h7z" />
  </Svg>
);
export const IconHome = (p: P) => (
  <Svg {...p}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V20h14V9.5" />
  </Svg>
);
export const IconLibrary = (p: P) => (
  <Svg {...p}>
    <path d="M3 20h18" />
    <path d="M5 20V6h3v14M9.5 20V4h3v16M14 20l-1-13 3-.6 2 13.4" />
  </Svg>
);
export const IconConvert = (p: P) => (
  <Svg {...p}>
    <path d="M4 8h13l-3-3" />
    <path d="M20 16H7l3 3" />
  </Svg>
);
export const IconNotes = (p: P) => (
  <Svg {...p}>
    <path d="M6 3h9l3 3v15H6z" />
    <path d="M9 9h6M9 13h6M9 17h4" />
  </Svg>
);
export const IconSearch = (p: P) => (
  <Svg strokeWidth={2.1} {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Svg>
);
export const IconPlus = (p: P) => (
  <Svg strokeWidth={2.2} {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);
export const IconBack = (p: P) => (
  <Svg strokeWidth={2.2} {...p}>
    <path d="m15 5-7 7 7 7" />
  </Svg>
);
export const IconChevron = (p: P) => (
  <Svg strokeWidth={2.6} {...p}>
    <path d="m9 5 7 7-7 7" />
  </Svg>
);
export const IconChevronDown = (p: P) => (
  <Svg strokeWidth={2.6} {...p}>
    <path d="m6 9 6 6 6-6" />
  </Svg>
);
export const IconSidebar = (p: P) => (
  <Svg strokeWidth={1.7} {...p}>
    <rect x="3" y="4.5" width="18" height="15" rx="3" />
    <path d="M15 4.5v15M17.5 8.5h1M17.5 11h1" />
  </Svg>
);
export const IconList = (p: P) => (
  <Svg {...p}>
    <path d="M9 6h11M9 12h11M9 18h11" />
    <path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" strokeWidth={2.8} />
  </Svg>
);
export const IconGrid = (p: P) => (
  <Svg strokeWidth={2} {...p}>
    <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
    <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
    <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
    <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
  </Svg>
);
export const IconBookmark = ({ filled, ...p }: P & { filled?: boolean }) => (
  <Svg {...p} fill={filled ? 'currentColor' : 'none'}>
    <path d="M6.5 3.5h11v17l-5.5-3.8-5.5 3.8z" />
  </Svg>
);
export const IconShare = (p: P) => (
  <Svg {...p}>
    <path d="M12 3v12" />
    <path d="m7.5 7.5 4.5-4.5 4.5 4.5" />
    <path d="M6 11H5v10h14V11h-1" />
  </Svg>
);
export const IconCopy = (p: P) => (
  <Svg {...p}>
    <path d="M9 9h11v11H9z" />
    <path d="M5 15H4V4h11v1" />
  </Svg>
);
export const IconDownload = (p: P) => (
  <Svg {...p}>
    <path d="M12 3v12" />
    <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
    <path d="M5 20h14" />
  </Svg>
);
export const IconImage = (p: P) => (
  <Svg {...p}>
    <path d="M4 5h16v14H4z" />
    <path d="m8 15 3-3 3 3 2-2 4 4" />
    <path d="M9 9.5h.01" strokeWidth={2.6} />
  </Svg>
);
export const IconChart = (p: P) => (
  <Svg {...p}>
    <path d="M4 20V10M10 20V4M16 20v-7M21 20H3" />
  </Svg>
);
export const IconPencil = (p: P) => (
  <Svg {...p}>
    <path d="M4 20h4L19 9l-4-4L4 16z" />
    <path d="m13.5 6.5 4 4" />
  </Svg>
);
export const IconCheck = (p: P) => (
  <Svg strokeWidth={2.8} {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Svg>
);
export const IconTrash = (p: P) => (
  <Svg {...p}>
    <path d="M4 7h16M10 11v6M14 11v6" />
    <path d="M6 7l1 13h10l1-13M9 7V4h6v3" />
  </Svg>
);
export const IconFile = (p: P) => (
  <Svg {...p}>
    <path d="M6 3h8l4 4v14H6z" />
    <path d="M14 3v4h4" />
  </Svg>
);
export const IconUpload = (p: P) => (
  <Svg strokeWidth={1.5} {...p}>
    <path d="M6 3h8l4 4v14H6z" />
    <path d="M14 3v4h4" />
    <path d="M12 17v-6M9.5 13.5 12 11l2.5 2.5" />
  </Svg>
);
export const IconArrowOut = (p: P) => (
  <Svg strokeWidth={2} {...p}>
    <path d="M7 17 17 7" />
    <path d="M9 7h8v8" />
  </Svg>
);
export const IconFlame = (p: P) => (
  <svg aria-hidden="true" width={p.size ?? 14} height={p.size ?? 14} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2.5c1.2 4.2 5.5 5.8 5.5 10.6A5.5 5.5 0 0 1 6.5 13c0-2.6 1.4-4.2 2.6-5.3.4 2 1.4 3.1 2.6 3.1-.1-3.1-.9-5.6.3-8.3z" />
  </svg>
);
export const IconInfo = (p: P) => (
  <Svg strokeWidth={2} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v6M12 7.5v.5" />
  </Svg>
);
export const IconHourglass = (p: P) => (
  <Svg {...p}>
    <path d="M6 3h12M6 21h12" />
    <path d="M7 3c0 5 10 6 10 9s-10 4-10 9M17 3c0 5-10 6-10 9s10 4 10 9" />
  </Svg>
);
