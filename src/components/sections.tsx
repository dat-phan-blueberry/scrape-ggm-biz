"use client";

import { useState } from "react";
import type {
  BusinessProfile,
  BusynessSlot,
  SimilarPlace,
  UserReview,
} from "@/lib/types";
import {
  Chip,
  IconCamera,
  IconChart,
  IconClock,
  IconCompass,
  IconDownload,
  IconGlobe,
  IconMessage,
  IconPhone,
  IconPin,
  IconSparkle,
  IconUsers,
  IconUtensils,
  IconWarn,
  IconArrow,
  IconBraces,
  MarkdownLite,
  RailCard,
  Section,
  Stars,
  StarSolid,
} from "@/components/ui";
import { openAuditReport } from "@/lib/report-html";

const VN_DAYS = ["chủ nhật", "thứ hai", "thứ ba", "thứ tư", "thứ năm", "thứ sáu", "thứ bảy"];
const EN_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const DAY_SHORT: Record<string, string> = {
  monday: "T2",
  tuesday: "T3",
  wednesday: "T4",
  thursday: "T5",
  friday: "T6",
  saturday: "T7",
  sunday: "CN",
};

const EXT_LABELS: Record<string, string> = {
  service_options: "Hình thức phục vụ",
  highlights: "Nổi bật",
  popular_for: "Được ưa chuộng",
  accessibility: "Hỗ trợ tiếp cận",
  offerings: "Có phục vụ",
  dining_options: "Bữa ăn",
  amenities: "Tiện nghi",
  atmosphere: "Không gian",
  crowd: "Khách",
  planning: "Lên kế hoạch",
  payments: "Thanh toán",
  children: "Trẻ em",
  parking: "Đỗ xe",
  pets: "Thú cưng",
  from_the_business: "Từ doanh nghiệp",
  getting_here: "Đường đến",
  other: "Khác",
};

function extLabel(key: string) {
  return EXT_LABELS[key] || key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/* ================= CỘT PHẢI — BẢNG CHÚ GIẢI ================= */

export function RatingRail({ profile }: { profile: BusinessProfile }) {
  if (profile.rating == null) return null;
  const total = profile.rating_summary.reduce((s, b) => s + b.amount, 0) || 1;
  return (
    <RailCard title="Điểm đánh giá" icon={StarSolid}>
      <div className="flex items-end gap-3">
        <span className="wider font-display text-[2.6rem] font-extrabold leading-none text-ink">
          {profile.rating.toFixed(1)}
        </span>
        <div className="pb-1">
          <Stars rating={profile.rating} className="h-4 w-4" />
          <p className="mt-1 font-mono text-[0.7rem] text-soft">
            {profile.reviews_count?.toLocaleString("vi-VN") ?? "—"} lượt đánh giá
          </p>
        </div>
      </div>
      {profile.rating_summary.length > 0 && (
        <div className="mt-4 space-y-1.5">
          {profile.rating_summary.map((b) => (
            <div key={b.stars} className="flex items-center gap-2">
              <span className="w-3 text-right font-mono text-[0.7rem] text-soft">{b.stars}</span>
              <StarSolid className="h-3 w-3 text-amber" />
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-field">
                <div
                  className="h-full rounded-full bg-amber"
                  style={{ width: `${(b.amount / total) * 100}%` }}
                />
              </div>
              <span className="w-9 text-right font-mono text-[0.7rem] text-soft">{b.amount}</span>
            </div>
          ))}
        </div>
      )}
    </RailCard>
  );
}

export function HoursRail({ profile }: { profile: BusinessProfile }) {
  if (!profile.open_state && profile.hours.length === 0) return null;
  const today = VN_DAYS[new Date().getDay()];
  const isOpen = profile.open_state.toLowerCase().startsWith("đang mở");
  return (
    <RailCard title="Giờ hoạt động" icon={IconClock}>
      {profile.open_state && (
        <p className="mb-3 flex items-center gap-2 text-[0.82rem] font-medium">
          <span
            className={`h-2 w-2 rounded-full ${isOpen ? "bg-moss pulse-dot" : "bg-pin"}`}
            aria-hidden
          />
          <span className={isOpen ? "text-moss-deep" : "text-pin"}>{profile.open_state}</span>
        </p>
      )}
      {profile.hours.length > 0 && (
        <table className="w-full text-[0.8rem]">
          <tbody>
            {profile.hours.map((h) => {
              const isToday = h.day.toLowerCase() === today;
              return (
                <tr key={h.day} className={isToday ? "font-semibold text-ink" : "text-soft"}>
                  <td className="py-0.5 capitalize">
                    {isToday && <span className="mr-1 text-moss">▸</span>}
                    {h.day}
                  </td>
                  <td className="py-0.5 text-right font-mono text-[0.74rem]">{h.time}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </RailCard>
  );
}

export function ContactRail({ profile }: { profile: BusinessProfile }) {
  const rows: { icon: React.ComponentType<{ className?: string }>; node: React.ReactNode }[] = [];
  if (profile.address)
    rows.push({
      icon: IconPin,
      node: <span>{profile.address}</span>,
    });
  if (profile.phone)
    rows.push({
      icon: IconPhone,
      node: (
        <a href={`tel:${profile.phone}`} className="font-mono text-[0.78rem] text-moss-deep hover:underline">
          {profile.phone}
        </a>
      ),
    });
  if (profile.website)
    rows.push({
      icon: IconGlobe,
      node: (
        <a
          href={profile.website}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all text-moss-deep hover:underline"
        >
          {(() => {
            try {
              return new URL(profile.website).hostname.replace(/^www\./, "");
            } catch {
              return profile.website;
            }
          })()}
        </a>
      ),
    });
  if (profile.maps_link)
    rows.push({
      icon: IconCompass,
      node: (
        <a
          href={profile.maps_link}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-moss-deep hover:underline"
        >
          Mở trên Google Maps <IconArrow className="h-3 w-3" />
        </a>
      ),
    });
  if (rows.length === 0) return null;
  return (
    <RailCard title="Liên hệ & vị trí" icon={IconPin}>
      <ul className="space-y-2.5 text-[0.82rem] leading-snug">
        {rows.map((r, i) => (
          <li key={i} className="flex gap-2.5">
            <r.icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-soft" />
            <div className="min-w-0">{r.node}</div>
          </li>
        ))}
      </ul>
      {profile.booking_links.length > 0 && (
        <div className="mt-3 border-t border-line pt-3">
          <p className="wide mb-1.5 font-mono text-[0.62rem] uppercase tracking-[0.14em] text-soft">
            Kênh đặt chỗ đang có
          </p>
          <ul className="space-y-1.5 text-[0.78rem]">
            {profile.booking_links.map((b) => (
              <li key={b.link}>
                <a
                  href={b.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-moss-deep hover:underline"
                >
                  {b.name} <IconArrow className="h-3 w-3" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      {(profile.plus_code || profile.gps) && (
        <div className="mt-3 space-y-1 border-t border-line pt-3 font-mono text-[0.68rem] text-soft">
          {profile.plus_code && <p>PLUS {profile.plus_code}</p>}
          {profile.gps && (
            <p>
              {profile.gps.latitude.toFixed(6)}°N {profile.gps.longitude.toFixed(6)}°E
            </p>
          )}
        </div>
      )}
    </RailCard>
  );
}

export function PriceRail({ profile }: { profile: BusinessProfile }) {
  if (!profile.price && !profile.price_details) return null;
  const max = Math.max(...(profile.price_details?.distribution.map((d) => d.percentage) ?? [1]));
  return (
    <RailCard title="Mặt bằng giá" icon={IconChart}>
      {profile.price && (
        <p className="font-mono text-[0.95rem] font-semibold text-ink">{profile.price}</p>
      )}
      {profile.price_details && (
        <>
          <div className="mt-3 space-y-1.5">
            {profile.price_details.distribution.map((d) => (
              <div key={d.price} className="flex items-center gap-2">
                <span className="w-24 shrink-0 font-mono text-[0.66rem] leading-tight text-soft">
                  {d.price}
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-field">
                  <div
                    className="h-full rounded-full bg-moss"
                    style={{ width: `${(d.percentage / max) * 100}%` }}
                  />
                </div>
                <span className="w-8 text-right font-mono text-[0.66rem] text-soft">
                  {Math.round(d.percentage)}%
                </span>
              </div>
            ))}
          </div>
          <p className="mt-2 font-mono text-[0.66rem] text-soft">
            {profile.price_details.total_reported} lượt khách báo mức chi
          </p>
        </>
      )}
    </RailCard>
  );
}

export function AmenitiesRail({ profile }: { profile: BusinessProfile }) {
  if (profile.extensions.length === 0) return null;
  return (
    <RailCard title="Tiện ích & dịch vụ" icon={IconUsers}>
      <div className="space-y-3">
        {profile.extensions.map((g) => (
          <div key={g.key}>
            <p className="wide mb-1.5 font-mono text-[0.62rem] uppercase tracking-[0.14em] text-soft">
              {extLabel(g.key)}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {g.items.map((item, i) => (
                <Chip key={i}>{item}</Chip>
              ))}
            </div>
          </div>
        ))}
      </div>
    </RailCard>
  );
}

/* ================= CỘT CHÍNH ================= */

function ReviewCard({ review }: { review: UserReview }) {
  const [expanded, setExpanded] = useState(false);
  const long = review.description.length > 260;
  return (
    <article className="flex min-w-0 flex-col rounded-xl border border-line bg-card p-4 shadow-card">
      <header className="flex items-center gap-3">
        {review.user_thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={review.user_thumbnail}
            alt=""
            loading="lazy"
            className="h-9 w-9 rounded-full object-cover ring-1 ring-line"
          />
        ) : (
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-field font-display font-bold text-soft">
            {review.username.charAt(0)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.83rem] font-semibold">{review.username}</p>
          <p className="font-mono text-[0.66rem] text-soft">
            {review.user_review_count != null && `${review.user_review_count} đánh giá · `}
            {review.date}
          </p>
        </div>
        <Stars rating={review.rating} className="h-3.5 w-3.5" />
      </header>
      {review.description && (
        <p className={`mt-3 text-[0.83rem] leading-relaxed text-ink/85 ${expanded ? "" : "line-clamp-4"}`}>
          {review.description}
        </p>
      )}
      {long && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-1 self-start font-mono text-[0.7rem] text-moss-deep hover:underline"
        >
          {expanded ? "Thu gọn" : "Xem thêm"}
        </button>
      )}
      {review.images.length > 0 && (
        <div className="thin-scroll mt-3 flex gap-1.5 overflow-x-auto">
          {review.images.slice(0, 6).map((img, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={img}
              alt={`Ảnh ${i + 1} từ ${review.username}`}
              loading="lazy"
              className="h-14 w-14 shrink-0 rounded-md object-cover"
            />
          ))}
          {review.images.length > 6 && (
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-field font-mono text-[0.7rem] text-soft">
              +{review.images.length - 6}
            </span>
          )}
        </div>
      )}
    </article>
  );
}

export function ReviewsSection({ profile }: { profile: BusinessProfile }) {
  if (profile.user_reviews.length === 0) return null;
  return (
    <Section
      title="Khách nói gì"
      icon={IconMessage}
      meta={`${profile.user_reviews.length} bài nổi bật`}
    >
      <div className="grid gap-4 md:grid-cols-2">
        {profile.user_reviews.map((r, i) => (
          <ReviewCard key={i} review={r} />
        ))}
      </div>
    </Section>
  );
}

export function MenuSection({ profile }: { profile: BusinessProfile }) {
  const menu = profile.menu;
  if (!menu || (menu.highlights.length === 0 && menu.categories.length === 0)) return null;
  return (
    <Section title="Thực đơn" icon={IconUtensils} meta={`${menu.categories.length} nhóm món`}>
      {menu.highlights.length > 0 && (
        <div className="thin-scroll -mx-1 mb-4 flex gap-3 overflow-x-auto px-1 pb-2">
          {menu.highlights.filter((h) => h.thumbnail).slice(0, 12).map((h, i) => (
            <figure key={i} className="w-32 shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={h.thumbnail}
                alt={h.title}
                loading="lazy"
                className="h-24 w-32 rounded-lg object-cover shadow-card ring-1 ring-line"
              />
              <figcaption className="mt-1.5 line-clamp-2 text-[0.72rem] font-medium leading-tight text-ink/80">
                {h.title}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      {menu.categories.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-line bg-card shadow-card">
          {menu.categories.map((cat, ci) => (
            <details key={ci} open={ci === 0} className="group border-b border-line last:border-b-0">
              <summary className="flex cursor-pointer select-none items-center justify-between px-4 py-3 hover:bg-field/60">
                <span className="wide font-display text-[0.78rem] font-bold uppercase tracking-[0.1em]">
                  {cat.title}
                </span>
                <span className="font-mono text-[0.66rem] text-soft">
                  {cat.items.length} món <span className="inline-block transition-transform group-open:rotate-180">▾</span>
                </span>
              </summary>
              <ul className="space-y-2.5 px-4 pb-4 pt-1">
                {cat.items.map((item, ii) => (
                  <li key={ii}>
                    <div className="flex items-baseline gap-2">
                      <span className="text-[0.83rem] font-medium">{item.title}</span>
                      <span className="dot-leader min-w-4 flex-1" aria-hidden />
                      <span className="font-mono text-[0.78rem] font-semibold text-moss-deep">
                        {item.price}
                      </span>
                    </div>
                    {item.description && (
                      <p className="mt-0.5 max-w-[52ch] text-[0.74rem] leading-snug text-soft">
                        {item.description}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      )}
      <p className="mt-2 font-mono text-[0.66rem] text-soft">
        * Giá do quán đăng trên Google, có thể chưa cập nhật
      </p>
    </Section>
  );
}

export function PopularTimesSection({ profile }: { profile: BusinessProfile }) {
  const pt = profile.popular_times;
  const todayEn = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][
    new Date().getDay()
  ];
  const [day, setDay] = useState(
    pt && pt.graph[pt.current_day] ? pt.current_day : todayEn
  );
  if (!pt) return null;
  const slots: BusynessSlot[] = pt.graph[day] || [];
  const peak = Math.max(...slots.map((s) => s.busyness_score), 1);

  return (
    <Section title="Giờ cao điểm" icon={IconChart} meta="mức độ đông khách theo giờ">
      <div className="rounded-xl border border-line bg-card p-4 shadow-card">
        <div className="thin-scroll mb-4 flex gap-1 overflow-x-auto">
          {EN_DAYS.map((d) => {
            const active = d === day;
            return (
              <button
                key={d}
                onClick={() => setDay(d)}
                disabled={!pt.graph[d]}
                className={`rounded-md px-2.5 py-1 font-mono text-[0.72rem] transition-colors disabled:opacity-30 ${
                  active ? "bg-moss text-card" : "text-soft hover:bg-field"
                }`}
              >
                {DAY_SHORT[d]}
                {d === pt.current_day && (
                  <span className={active ? "text-card/70" : "text-moss"}> •</span>
                )}
              </button>
            );
          })}
        </div>
        {slots.length > 0 ? (
          <>
            <div className="flex h-28 items-end gap-[3px]">
              {slots.map((s, i) => (
                <div
                  key={i}
                  className="group relative flex-1 rounded-t-sm bg-moss/35 transition-colors hover:bg-moss"
                  style={{ height: `${Math.max((s.busyness_score / peak) * 100, 3)}%` }}
                  title={`${s.time} — ${s.info || `${s.busyness_score}% đông`}`}
                />
              ))}
            </div>
            <div className="mt-1.5 flex justify-between font-mono text-[0.62rem] text-soft">
              {slots
                .filter((_, i) => i % 3 === 0)
                .map((s, i) => (
                  <span key={i}>{s.time.replace(" giờ", "h")}</span>
                ))}
            </div>
          </>
        ) : (
          <p className="py-6 text-center font-mono text-[0.72rem] text-soft">
            Chưa có dữ liệu cho ngày này
          </p>
        )}
      </div>
    </Section>
  );
}

export function GallerySection({ profile }: { profile: BusinessProfile }) {
  if (profile.images.length === 0) return null;
  return (
    <Section title="Kho ảnh" icon={IconCamera} meta={`${profile.images.length} bộ sưu tập`}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {profile.images.map((img, i) => (
          <figure key={i} className="group relative overflow-hidden rounded-lg ring-1 ring-line">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={img.thumbnail}
              alt={img.title}
              loading="lazy"
              className="aspect-square w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
            <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/75 to-transparent px-2 pb-1.5 pt-5 text-[0.7rem] font-medium text-card">
              {img.title}
            </figcaption>
          </figure>
        ))}
      </div>
    </Section>
  );
}

export function SimilarSection({
  profile,
  onSelect,
}: {
  profile: BusinessProfile;
  onSelect: (p: SimilarPlace) => void;
}) {
  if (profile.similar_places.length === 0) return null;
  return (
    <Section title="Khách cũng tìm" icon={IconUsers} meta="bấm để tra hồ sơ">
      <div className="grid gap-3 sm:grid-cols-2">
        {profile.similar_places.map((p, i) => (
          <button
            key={i}
            onClick={() => onSelect(p)}
            disabled={!p.data_id}
            className="group flex min-w-0 items-center gap-3 rounded-xl border border-line bg-card p-3 text-left shadow-card transition-all hover:border-moss/40 hover:shadow-pop disabled:cursor-default"
          >
            {p.thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.thumbnail} alt="" loading="lazy" className="h-11 w-11 rounded-lg object-cover" />
            ) : (
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-field">
                <IconPin className="h-4 w-4 text-soft" />
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[0.83rem] font-semibold group-hover:text-moss-deep">
                {p.title}
              </span>
              {p.rating != null && (
                <span className="mt-0.5 flex items-center gap-1 font-mono text-[0.7rem] text-soft">
                  <StarSolid className="h-3 w-3 text-amber" />
                  {p.rating} ({p.reviews ?? 0})
                </span>
              )}
            </span>
            <IconArrow className="h-3.5 w-3.5 shrink-0 text-soft opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
        ))}
      </div>
    </Section>
  );
}

/* ================= THẨM ĐỊNH AI ================= */

export type AiState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; analysis: string }
  | { status: "error"; message: string };

export function AiAuditSection({
  state,
  onRun,
  restaurant,
}: {
  state: AiState;
  onRun: () => void;
  restaurant: string;
}) {
  const score =
    state.status === "done"
      ? state.analysis.match(/(\d+(?:[.,]\d+)?)\s*\/\s*10/)?.[1]?.replace(",", ".")
      : null;

  const exportPdf = () => {
    if (state.status !== "done") return;
    const opened = openAuditReport({
      restaurant,
      analysis: state.analysis,
      score,
      logoUrl: `${window.location.origin}/logo.png`,
    });
    if (!opened) {
      window.alert("Trình duyệt đang chặn cửa sổ mới — hãy cho phép popup để xuất PDF.");
    }
  };

  return (
    <Section title="Thẩm định hồ sơ" icon={IconSparkle} meta="đánh giá hiện diện Google Maps">
      <div className="overflow-hidden rounded-xl border border-line bg-card shadow-card">
        {state.status === "idle" && (
          <div className="flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-[46ch] text-[0.83rem] leading-relaxed text-soft">
              Chạy bản thẩm định tự động: điểm mạnh, thiếu sót và những việc quán cần làm để
              cải thiện hiện diện trên Google Maps.
            </p>
            <button
              onClick={onRun}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-moss px-4 py-2.5 text-[0.83rem] font-semibold text-card shadow-card transition-colors hover:bg-moss-deep"
            >
              <IconSparkle className="h-4 w-4" />
              Review Business Profile
            </button>
          </div>
        )}

        {state.status === "loading" && (
          <div className="space-y-3 p-5">
            <p className="wide font-mono text-[0.68rem] uppercase tracking-[0.18em] text-soft">
              Đang phân tích hồ sơ…
            </p>
            <div className="skeleton h-4 w-3/4" />
            <div className="skeleton h-4 w-full" />
            <div className="skeleton h-4 w-5/6" />
            <div className="skeleton h-4 w-2/3" />
          </div>
        )}

        {state.status === "error" && (
          <div className="flex items-start gap-3 p-5">
            <IconWarn className="mt-0.5 h-4 w-4 shrink-0 text-pin" />
            <div>
              <p className="text-[0.83rem] font-semibold text-pin">Chưa chạy được thẩm định</p>
              <p className="mt-1 break-all text-[0.78rem] text-soft">{state.message}</p>
              <button
                onClick={onRun}
                className="mt-3 rounded-lg border border-line px-3 py-1.5 text-[0.78rem] font-medium hover:border-moss hover:text-moss-deep"
              >
                Thử lại
              </button>
            </div>
          </div>
        )}

        {state.status === "done" && (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-field/50 px-5 py-3">
              <p className="wide font-mono text-[0.66rem] uppercase tracking-[0.18em] text-soft">
                Báo cáo thẩm định
              </p>
              <div className="flex items-center gap-4">
                {score && (
                  <p className="flex items-baseline gap-1 font-display">
                    <span className="wider text-xl font-extrabold text-moss-deep">{score}</span>
                    <span className="font-mono text-[0.66rem] text-soft">/10 cạnh tranh</span>
                  </p>
                )}
                <button
                  onClick={exportPdf}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-card px-3 py-1.5 text-[0.74rem] font-semibold shadow-card transition-colors hover:border-moss/50 hover:text-moss-deep"
                >
                  <IconDownload className="h-3.5 w-3.5" />
                  Xuất PDF
                </button>
              </div>
            </div>
            <div className="p-5">
              <MarkdownLite text={state.analysis} />
            </div>
          </div>
        )}
      </div>
    </Section>
  );
}

/* ================= JSON GỐC ================= */

export function RawJsonSection({ raw }: { raw: unknown }) {
  if (raw == null) return null;
  return (
    <Section title="Dữ liệu gốc" icon={IconBraces} meta="toàn bộ dữ liệu thu thập">
      <details className="group overflow-hidden rounded-xl border border-line bg-card shadow-card">
        <summary className="flex cursor-pointer select-none items-center justify-between px-4 py-3 font-mono text-[0.74rem] text-soft hover:bg-field/60">
          <span>du_lieu_goc.json</span>
          <span className="transition-transform group-open:rotate-180">▾</span>
        </summary>
        <pre className="thin-scroll max-h-[480px] overflow-auto border-t border-line bg-ink p-4 font-mono text-[0.7rem] leading-relaxed text-card/90">
          {JSON.stringify(raw, null, 2)}
        </pre>
      </details>
    </Section>
  );
}
