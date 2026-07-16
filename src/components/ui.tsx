import React from "react";

/* ---------- Bộ icon nét mảnh, đồng bộ 1.7px ---------- */

type IconProps = { className?: string };

function icon(path: React.ReactNode) {
  return function Icon({ className = "w-4 h-4" }: IconProps) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden="true"
      >
        {path}
      </svg>
    );
  };
}

export const IconSearch = icon(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.8-3.8" />
  </>
);

export const IconPin = icon(
  <>
    <path d="M12 21s7-5.8 7-11a7 7 0 1 0-14 0c0 5.2 7 11 7 11z" />
    <circle cx="12" cy="10" r="2.6" />
  </>
);

export const IconPhone = icon(
  <path d="M5 4h4l1.5 4.5-2.2 1.6a12 12 0 0 0 5.6 5.6l1.6-2.2L20 15v4a1.5 1.5 0 0 1-1.6 1.5C10.6 20 4 13.4 3.5 5.6A1.5 1.5 0 0 1 5 4z" />
);

export const IconGlobe = icon(
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M3.5 12h17M12 3.5c2.6 2.3 3.8 5.2 3.8 8.5s-1.2 6.2-3.8 8.5c-2.6-2.3-3.8-5.2-3.8-8.5s1.2-6.2 3.8-8.5z" />
  </>
);

export const IconClock = icon(
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7v5l3.2 2" />
  </>
);

export const IconArrow = icon(<path d="M7 17 17 7M9 7h8v8" />);

export const IconX = icon(<path d="M6 6l12 12M18 6 6 18" />);

export const IconSparkle = icon(
  <path d="M12 3.5l1.9 5.3 5.3 1.9-5.3 1.9L12 17.9l-1.9-5.3-5.3-1.9 5.3-1.9L12 3.5zM19 16.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z" />
);

export const IconChevron = icon(<path d="m6 9 6 6 6-6" />);

export const IconCamera = icon(
  <>
    <path d="M4 8.5h3l1.6-2.5h6.8L17 8.5h3a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5a1 1 0 0 1 1-1z" />
    <circle cx="12" cy="13.5" r="3.2" />
  </>
);

export const IconUtensils = icon(
  <>
    <path d="M7 3v7a2 2 0 0 1-2 2v9M5 3v4M9 3v4" />
    <path d="M17 3c-1.7 1-2.5 3-2.5 5.5 0 2 .8 3.5 2.5 3.5v9" />
  </>
);

export const IconMessage = icon(
  <path d="M4 5.5h16v11H10l-4.5 4v-4H4v-11z" />
);

export const IconChart = icon(
  <path d="M4 20V10M9.3 20V4M14.6 20v-9M20 20V7" />
);

export const IconBraces = icon(
  <path d="M8 4c-2 0-2.5 1-2.5 2.5v3C5.5 11 4.5 12 3.5 12c1 0 2 1 2 2.5v3C5.5 19 6 20 8 20M16 4c2 0 2.5 1 2.5 2.5v3c0 1.5 1 2.5 2 2.5-1 0-2 1-2 2.5v3c0 1.5-.5 2.5-2.5 2.5" />
);

export const IconWarn = icon(
  <>
    <path d="M12 3.5 22 20H2L12 3.5z" />
    <path d="M12 10v4.2M12 17.2v.2" />
  </>
);

export const IconCompass = icon(
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="m15.5 8.5-2 5-5 2 2-5 5-2z" />
  </>
);

export const IconUsers = icon(
  <>
    <circle cx="9" cy="8.5" r="3.2" />
    <path d="M3.5 19.5c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" />
    <path d="M15.5 5.8a3.2 3.2 0 0 1 0 5.4M17.6 14.9c1.6.7 2.6 2.3 2.9 4.6" />
  </>
);

export function StarSolid({ className = "w-4 h-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 2.6l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.5l-5.9 3.1 1.2-6.5L2.5 9.5l6.6-.9 2.9-6z" />
    </svg>
  );
}

/* ---------- Sao đánh giá với phần lẻ ---------- */

export function Stars({ rating, className = "w-4 h-4" }: { rating: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, (rating / 5) * 100));
  return (
    <span
      className="relative inline-flex shrink-0"
      role="img"
      aria-label={`${rating} trên 5 sao`}
    >
      <span className="flex gap-0.5 text-ink/15">
        {[...Array(5)].map((_, i) => (
          <StarSolid key={i} className={className} />
        ))}
      </span>
      <span
        className="absolute inset-0 flex gap-0.5 overflow-hidden text-amber"
        style={{ width: `${pct}%` }}
      >
        {[...Array(5)].map((_, i) => (
          <StarSolid key={i} className={`${className} shrink-0`} />
        ))}
      </span>
    </span>
  );
}

/* ---------- Khung section nằm trên xương sống lộ trình ---------- */

export function Section({
  title,
  icon: IconEl,
  meta,
  children,
}: {
  title: string;
  icon?: React.ComponentType<IconProps>;
  meta?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="relative md:pl-9">
      <span
        aria-hidden
        className="absolute left-[1px] top-[3px] hidden h-3.5 w-3.5 rounded-full border-2 border-moss bg-card md:block"
      />
      <header className="mb-3 flex items-baseline gap-3">
        <h2 className="wide flex items-center gap-2 font-display text-[0.82rem] font-bold uppercase tracking-[0.14em] text-ink">
          {IconEl ? <IconEl className="h-4 w-4 text-moss" /> : null}
          {title}
        </h2>
        {meta ? <span className="font-mono text-[0.68rem] text-soft">{meta}</span> : null}
        <span className="h-px flex-1 self-center bg-ink/10" />
      </header>
      {children}
    </section>
  );
}

/* ---------- Thẻ ở cột thông tin bên phải ---------- */

export function RailCard({
  title,
  icon: IconEl,
  children,
}: {
  title: string;
  icon?: React.ComponentType<IconProps>;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-line bg-card p-4 shadow-card">
      <h3 className="wide mb-3 flex items-center gap-2 font-display text-[0.72rem] font-bold uppercase tracking-[0.14em] text-soft">
        {IconEl ? <IconEl className="h-3.5 w-3.5 text-moss" /> : null}
        {title}
      </h3>
      {children}
    </div>
  );
}

export function Chip({ children, tone = "field" }: { children: React.ReactNode; tone?: "field" | "moss" | "warn" }) {
  const tones = {
    field: "bg-field text-ink/80",
    moss: "bg-moss/10 text-moss-deep",
    warn: "bg-pin/10 text-pin",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[0.72rem] font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

/* ---------- Thước tỉ lệ — vạch phân cách kiểu bản đồ ---------- */

export function ScaleRule({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-4" aria-hidden>
      <svg className="h-3 flex-1 text-ink/30" preserveAspectRatio="none" viewBox="0 0 400 12">
        <line x1="0" y1="11" x2="400" y2="11" stroke="currentColor" strokeWidth="1" />
        {[0, 50, 100, 150, 200, 250, 300, 350, 400].map((x) => (
          <line key={x} x1={x} y1={x % 100 === 0 ? 2 : 6} x2={x} y2="11" stroke="currentColor" strokeWidth="1" />
        ))}
      </svg>
      {label ? (
        <span className="wide shrink-0 font-mono text-[0.62rem] uppercase tracking-[0.18em] text-soft">{label}</span>
      ) : null}
    </div>
  );
}

/* ---------- Trình kết xuất markdown gọn cho báo cáo AI ---------- */

function inlineLight(text: string, keyBase: string): React.ReactNode[] {
  // *nhấn* và `mã` bên trong đoạn thường
  const out: React.ReactNode[] = [];
  const tokens = text.split(/(`[^`]+`|\*[^*\n]+\*)/g);
  tokens.forEach((tok, i) => {
    if (/^`[^`]+`$/.test(tok)) {
      out.push(
        <code key={`${keyBase}-c${i}`} className="rounded bg-field px-1 py-0.5 font-mono text-[0.85em]">
          {tok.slice(1, -1)}
        </code>
      );
    } else if (/^\*[^*\n]+\*$/.test(tok)) {
      out.push(<em key={`${keyBase}-e${i}`}>{tok.slice(1, -1)}</em>);
    } else if (tok) {
      out.push(tok);
    }
  });
  return out;
}

function inlineMd(text: string, keyBase: string): React.ReactNode[] {
  return text.split(/\*\*(.+?)\*\*/g).flatMap((part, i) =>
    i % 2 === 1
      ? [
          <strong key={`${keyBase}-${i}`} className="font-semibold text-ink">
            {inlineLight(part, `${keyBase}-s${i}`)}
          </strong>,
        ]
      : inlineLight(part, `${keyBase}-t${i}`)
  );
}

export function MarkdownLite({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let key = 0;

  const flushList = () => {
    if (!list) return;
    const items = list.items.map((item, i) => (
      <li key={i} className="relative pl-5">
        <span
          className={`absolute left-0 top-[0.52em] ${
            list!.ordered ? "hidden" : "h-1.5 w-1.5 rounded-sm bg-moss"
          }`}
          aria-hidden
        />
        {inlineMd(item, `li-${key}-${i}`)}
      </li>
    ));
    blocks.push(
      list.ordered ? (
        <ol key={key++} className="my-2 list-decimal space-y-1.5 pl-5 marker:font-mono marker:text-[0.8em] marker:text-moss-deep">
          {items}
        </ol>
      ) : (
        <ul key={key++} className="my-2 space-y-1.5">
          {items}
        </ul>
      )
    );
    list = null;
  };

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      flushList();
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
      // kẻ ngang: bỏ qua, các heading đã tự phân tách
      flushList();
      continue;
    }
    const heading = line.match(/^(#{2,4})\s+(.*)$/);
    if (heading) {
      flushList();
      blocks.push(
        <h4
          key={key++}
          className="wide mb-1.5 mt-5 flex items-center gap-2 font-display text-[0.78rem] font-bold uppercase tracking-[0.12em] text-moss-deep first:mt-0"
        >
          <span className="h-[7px] w-[7px] rotate-45 bg-moss" aria-hidden />
          {heading[2].replace(/\*\*/g, "")}
        </h4>
      );
      continue;
    }
    const bullet = line.match(/^[-*]\s+(.*)$/);
    if (bullet) {
      if (!list || list.ordered) {
        flushList();
        list = { ordered: false, items: [] };
      }
      list.items.push(bullet[1]);
      continue;
    }
    const numbered = line.match(/^\d+[.)]\s+(.*)$/);
    if (numbered) {
      if (!list || !list.ordered) {
        flushList();
        list = { ordered: true, items: [] };
      }
      list.items.push(numbered[1]);
      continue;
    }
    flushList();
    blocks.push(
      <p key={key++} className="my-2">
        {inlineMd(line, `p-${key}`)}
      </p>
    );
  }
  flushList();

  return <div className="text-[0.875rem] leading-relaxed text-ink/85">{blocks}</div>;
}

/* ---------- Skeleton khi đang tải hồ sơ ---------- */

export function DossierSkeleton() {
  return (
    <div className="mt-10 space-y-8" aria-label="Đang tải hồ sơ">
      <div className="flex gap-5">
        <div className="skeleton h-24 w-24 shrink-0" />
        <div className="flex-1 space-y-3 pt-1">
          <div className="skeleton h-7 w-2/3" />
          <div className="skeleton h-4 w-1/3" />
          <div className="skeleton h-4 w-1/2" />
        </div>
      </div>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_330px]">
        <div className="space-y-6">
          <div className="skeleton h-44" />
          <div className="skeleton h-64" />
        </div>
        <div className="space-y-6">
          <div className="skeleton h-40" />
          <div className="skeleton h-56" />
        </div>
      </div>
      <p className="wide text-center font-mono text-[0.68rem] uppercase tracking-[0.2em] text-soft">
        Đang trích xuất hồ sơ từ Google Maps…
      </p>
    </div>
  );
}
