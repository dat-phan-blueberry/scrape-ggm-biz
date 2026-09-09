"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type BusinessProfile,
  type ChatMessage,
  type SimilarPlace,
  type Suggestion,
  getVenueAuditMemory,
  saveVenueAuditMemory,
  clearVenueAuditMemory,
  parseAndValidateScore,
  reportValidationError,
  splitRefinement,
} from "@/lib/types";
import {
  Chip,
  DossierSkeleton,
  IconArrow,
  IconPin,
  IconSearch,
  IconWarn,
  IconX,
  ScaleRule,
  Stars,
} from "@/components/ui";
import {
  AiAuditSection,
  AmenitiesRail,
  ContactRail,
  GallerySection,
  HoursRail,
  MenuSection,
  PopularTimesSection,
  PriceRail,
  RatingRail,
  ReviewsSection,
  SimilarSection,
  RawJsonSection,
  type AiState,
} from "@/components/sections";

const SAMPLE_QUERIES = ["bò leo thang", "phở thìn", "cục gạch quán"];

export default function HomePage() {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [searching, setSearching] = useState(false);

  const [selectedName, setSelectedName] = useState("");
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [raw, setRaw] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ai, setAi] = useState<AiState>({ status: "idle" });
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isRefining, setIsRefining] = useState(false);
  const [currentUser, setCurrentUser] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastFetchRef = useRef<{ dataId: string; lat: number | null; lng: number | null } | null>(null);

  /* ---------- Thông tin người dùng & Đăng xuất ---------- */

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user?.email) {
          setCurrentUser(data.user.email);
        }
      })
      .catch(() => {});
  }, []);

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Bỏ qua lỗi kết nối và chuyển hướng
    } finally {
      window.location.href = "/login";
    }
  };

  /* ---------- Gợi ý tìm kiếm ---------- */

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const fetchSuggestions = useCallback(async (q: string) => {
    abortRef.current?.abort();
    if (q.trim().length < 2) {
      setSuggestions([]);
      setDropdownOpen(false);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setSearching(true);
    try {
      const res = await fetch(`/api/autocomplete?q=${encodeURIComponent(q)}`, {
        signal: controller.signal,
      });
      const data = await res.json();
      if (controller.signal.aborted) return;
      const list: Suggestion[] = data.suggestions || [];
      setSuggestions(list);
      setActiveIndex(-1);
      setDropdownOpen(list.length > 0);
    } catch {
      if (!controller.signal.aborted) setSuggestions([]);
    } finally {
      if (!controller.signal.aborted) setSearching(false);
    }
  }, []);

  const handleInput = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(value), 300);
  };

  const runSample = (q: string) => {
    setQuery(q);
    inputRef.current?.focus();
    fetchSuggestions(q);
  };

  /* ---------- Lấy hồ sơ ---------- */

  const fetchProfile = useCallback(
    async (dataId: string, lat: number | null, lng: number | null, displayName: string) => {
      lastFetchRef.current = { dataId, lat, lng };
      setSelectedName(displayName);
      setDropdownOpen(false);
      setLoading(true);
      setError("");
      setProfile(null);
      setRaw(null);
      setAi({ status: "idle" });
      setChatMessages([]);
      setIsRefining(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
      try {
        const params = new URLSearchParams({ data_id: dataId });
        if (lat != null) params.set("lat", String(lat));
        if (lng != null) params.set("lng", String(lng));
        const res = await fetch(`/api/business-profile?${params.toString()}`);
        const data = await res.json();
        if (!res.ok || data.error) {
          setError(data.error || `Lỗi ${res.status} khi lấy hồ sơ`);
        } else {
          setProfile(data.profile);
          setRaw(data.raw);

          // Khôi phục bộ nhớ ẩn (chat history & các quyết định chỉnh sửa) của riêng nhà hàng này
          const memory = getVenueAuditMemory(dataId);
          if (memory && memory.analysis) {
            setAi({ status: "done", analysis: memory.analysis });
            setChatMessages(memory.messages || []);
          } else {
            setAi({ status: "idle" });
            setChatMessages([]);
          }
        }
      } catch {
        setError("Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const handleSelect = (s: Suggestion) => {
    if (s.data_id) {
      setQuery(s.value);
      fetchProfile(s.data_id, s.latitude, s.longitude, s.value);
    } else {
      // gợi ý dạng từ khóa: điền vào ô và tìm tiếp
      setQuery(s.value);
      fetchSuggestions(s.value);
      inputRef.current?.focus();
    }
  };

  const handleSelectSimilar = (p: SimilarPlace) => {
    if (!p.data_id) return;
    setQuery(p.title);
    fetchProfile(p.data_id, p.latitude, p.longitude, p.title);
  };

  const retryProfile = () => {
    const last = lastFetchRef.current;
    if (last) fetchProfile(last.dataId, last.lat, last.lng, selectedName);
  };

  /* ---------- Thẩm định AI ---------- */

  const runAiAudit = async () => {
    if (!profile) return;
    setAi({ status: "streaming", analysis: "" });

    // Ưu tiên Supabase Edge Function (stream SSE thật). Nếu không cấu hình
    // thì fallback về API route nội bộ (/api/ai-analysis, trả JSON).
    const endpoint =
      process.env.NEXT_PUBLIC_AI_ANALYSIS_URL?.trim() || "/api/ai-analysis";

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile }),
      });

      const contentType = res.headers.get("content-type") || "";
      const isStream = contentType.includes("text/event-stream") && !!res.body;

      // ---- Trường hợp 1: SSE thật (Supabase) -> hiện chữ theo từng chunk ----
      if (isStream) {
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let acc = "";
        let errMsg: string | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let nl: number;
          while ((nl = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            if (!line.startsWith("data:")) continue; // bỏ qua ": ping"
            const payload = line.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            try {
              const obj = JSON.parse(payload);
              if (obj.error) {
                errMsg = obj.error;
              } else if (typeof obj.text === "string") {
                acc += obj.text;
                setAi({ status: "streaming", analysis: acc });
              }
            } catch {
              /* chunk chưa hoàn chỉnh -> bỏ qua */
            }
          }
        }

        const validScore = parseAndValidateScore(acc);
        if (!errMsg && acc.trim() && acc.length >= 300 && validScore && !reportValidationError(acc)) {
          setAi({ status: "done", analysis: acc });
          const targetDataId = profile.data_id || lastFetchRef.current?.dataId;
          if (targetDataId) {
            saveVenueAuditMemory(targetDataId, {
              dataId: targetDataId,
              title: profile.title,
              lastUpdated: Date.now(),
              analysis: acc,
              messages: [],
            });
          }
        } else {
          setAi({
            status: "error",
            message: errMsg || "Quá trình phân tích bị gián đoạn giữa chừng do đường truyền AI. Vui lòng bấm Thử lại để tải đầy đủ bản báo cáo.",
          });
        }
        return;
      }

      // ---- Trường hợp 2: JSON (API route Netlify) -> typewriter ở client ----
      const data = await res.json();
      if (!res.ok || data.error) {
        setAi({ status: "error", message: data.error || `Lỗi ${res.status}` });
        return;
      }
      const full: string = data.analysis ?? "";
      if (!full.trim() || reportValidationError(full)) {
        setAi({ status: "error", message: "Báo cáo chưa đầy đủ hoặc điểm không đúng thang 0–10. Vui lòng thử lại." });
        return;
      }
      await new Promise<void>((resolve) => {
        let i = 0;
        const step = Math.max(3, Math.round(full.length / 220)); // ~3.5s
        const timer = window.setInterval(() => {
          i = Math.min(full.length, i + step);
          setAi({ status: "streaming", analysis: full.slice(0, i) });
          if (i >= full.length) {
            window.clearInterval(timer);
            resolve();
          }
        }, 16);
      });
      setAi({ status: "done", analysis: full });
      const targetDataId = profile.data_id || lastFetchRef.current?.dataId;
      if (targetDataId) {
        saveVenueAuditMemory(targetDataId, {
          dataId: targetDataId,
          title: profile.title,
          lastUpdated: Date.now(),
          analysis: full,
          messages: [],
        });
      }
    } catch {
      setAi({ status: "error", message: "Không kết nối được máy chủ." });
    }
  };

  /* ---------- Cải thiện/sửa đổi báo cáo qua chat ---------- */

  const handleRefine = useCallback(
    async (instruction: string) => {
      if (!profile || ai.status !== "done") return;
      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: instruction,
        timestamp: Date.now(),
      };
      const updatedMessages = [...chatMessages, userMsg];
      setChatMessages(updatedMessages);
      setIsRefining(true);

      const endpoint =
        process.env.NEXT_PUBLIC_AI_ANALYSIS_URL?.trim() || "/api/ai-analysis";

      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profile,
            currentAnalysis: ai.analysis,
            messages: updatedMessages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
          }),
        });

        let data;
        if (res.headers.get("content-type")?.includes("text/event-stream") && res.body) {
          const streamText = await res.text();
          let text = "";
          let error = "";
          for (const line of streamText.split(/\r?\n/)) {
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            const event = JSON.parse(payload);
            if (event.error) error = event.error;
            if (typeof event.text === "string") text += event.text;
          }
          const refinement = splitRefinement(text);
          data = error ? { error } : refinement
            ? { ...refinement, analysis: refinement.updatedAnalysis ?? ai.analysis }
            : { error: "Phản hồi chưa hoàn chỉnh. Vui lòng thử lại." };
        } else {
          data = await res.json();
        }
        if (!data.error && reportValidationError(data.updatedAnalysis || data.analysis || ai.analysis)) {
          data = { error: "Báo cáo chưa đầy đủ hoặc điểm không đúng thang 0–10. Vui lòng thử lại." };
        }
        if (!res.ok || data.error) {
          const errorMsg: ChatMessage = {
            id: `model-${Date.now()}`,
            role: "model",
            content: `Chưa thể cập nhật: ${data.error || `Lỗi ${res.status}`}`,
            timestamp: Date.now(),
          };
          setChatMessages([...updatedMessages, errorMsg]);
        } else {
          const targetReport: string = (data.updatedAnalysis || data.analysis || ai.analysis || "").trim();
          if (targetReport && targetReport !== ai.analysis) {
            setAi({ status: "done", analysis: targetReport });
          }

          const botResponse =
            data.reply?.trim() ||
            (data.updatedAnalysis
              ? `Đã cập nhật báo cáo theo yêu cầu: "${instruction}"`
              : "Đã tiếp nhận và xử lý yêu cầu của bạn.");

          const modelMsg: ChatMessage = {
            id: `model-${Date.now()}`,
            role: "model",
            content: botResponse,
            timestamp: Date.now(),
          };
          const finalMessages = [...updatedMessages, modelMsg];
          setChatMessages(finalMessages);

          // Tự động append và lưu ngầm toàn bộ lịch sử chỉnh sửa & quyết định của nhà hàng
          const targetDataId = profile.data_id || lastFetchRef.current?.dataId;
          if (targetDataId) {
            saveVenueAuditMemory(targetDataId, {
              dataId: targetDataId,
              title: profile.title,
              lastUpdated: Date.now(),
              analysis: targetReport || ai.analysis,
              messages: finalMessages,
            });
          }
        }
      } catch {
        const errorMsg: ChatMessage = {
          id: `model-${Date.now()}`,
          role: "model",
          content: "Lỗi kết nối khi gửi yêu cầu chỉnh sửa. Vui lòng thử lại.",
          timestamp: Date.now(),
        };
        setChatMessages([...updatedMessages, errorMsg]);
      } finally {
        setIsRefining(false);
      }
    },
    [profile, ai, chatMessages]
  );

  /* ---------- Đặt lại / Khảo sát lại từ đầu ---------- */

  const handleResetAudit = useCallback(() => {
    const targetDataId = profile?.data_id || lastFetchRef.current?.dataId;
    if (targetDataId) {
      clearVenueAuditMemory(targetDataId);
    }
    setChatMessages([]);
    setAi({ status: "idle" });
  }, [profile]);

  /* ---------- Bàn phím cho dropdown ---------- */

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!dropdownOpen || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick =
        suggestions[activeIndex] ?? suggestions.find((s) => s.data_id) ?? suggestions[0];
      if (pick) handleSelect(pick);
    } else if (e.key === "Escape") {
      setDropdownOpen(false);
    }
  };

  const showEmptyState = !profile && !loading && !error;

  return (
    <div className="flex min-h-screen flex-col">
      {/* ===== Thanh công cụ ===== */}
      <header className="sticky top-0 z-30 border-b border-line bg-paper/85 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-moss text-card">
            <IconPin className="h-4 w-4" />
          </span>
          <div className="flex items-baseline gap-3">
            <span className="wider font-display text-lg font-extrabold tracking-[0.08em]">
              ĐỊA BẠ
            </span>
            <span className="hidden font-mono text-[0.66rem] uppercase tracking-[0.18em] text-soft sm:inline">
              hồ sơ quán từ Google Maps
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <span className="wide hidden rounded-md border border-line px-2 py-1 font-mono text-[0.62rem] uppercase tracking-[0.14em] text-soft md:inline">
              Khảo sát F&B
            </span>
            {currentUser && (
              <div className="flex items-center gap-2 border-l border-line pl-2 sm:pl-3">
                <span
                  className="max-w-[130px] truncate font-mono text-[0.72rem] text-soft sm:max-w-[200px]"
                  title={currentUser}
                >
                  {currentUser}
                </span>
                <button
                  onClick={handleLogout}
                  className="rounded-lg border border-line bg-card px-2 py-1 font-mono text-[0.68rem] font-medium text-soft transition-colors hover:border-pin/40 hover:bg-pin/5 hover:text-pin"
                  title="Đăng xuất khỏi hệ thống"
                >
                  Đăng xuất
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-20 sm:px-6">
        {/* ===== Ô định vị ===== */}
        <div className="mx-auto mt-10 max-w-2xl">
          <p className="wide mb-2 font-mono text-[0.66rem] uppercase tracking-[0.22em] text-soft">
            Tra cứu địa điểm
          </p>
          <div ref={boxRef} className="relative">
            <div className="flex items-center gap-3 rounded-xl border border-line bg-card px-4 shadow-card transition-shadow focus-within:border-moss/50 focus-within:shadow-pop">
              <IconSearch className="h-5 w-5 shrink-0 text-soft" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => handleInput(e.target.value)}
                onFocus={() => suggestions.length > 0 && setDropdownOpen(true)}
                onKeyDown={onKeyDown}
                placeholder="Tên quán ăn, nhà hàng, quán cà phê…"
                aria-label="Tìm địa điểm"
                autoComplete="off"
                spellCheck={false}
                className="min-w-0 flex-1 bg-transparent py-4 text-[0.95rem] outline-none placeholder:text-soft/60"
              />
              {searching ? (
                <span
                  className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-moss border-t-transparent"
                  aria-label="Đang tìm"
                />
              ) : query ? (
                <button
                  onClick={() => {
                    setQuery("");
                    setSuggestions([]);
                    setDropdownOpen(false);
                    inputRef.current?.focus();
                  }}
                  aria-label="Xóa từ khóa"
                  className="shrink-0 rounded-md p-1 text-soft hover:bg-field hover:text-ink"
                >
                  <IconX className="h-4 w-4" />
                </button>
              ) : null}
            </div>

            {dropdownOpen && suggestions.length > 0 && (
              <ul
                role="listbox"
                className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-line bg-card shadow-pop"
              >
                {suggestions.map((s, i) => (
                  <li key={`${s.data_id}-${i}`}>
                    <button
                      role="option"
                      aria-selected={i === activeIndex}
                      onClick={() => handleSelect(s)}
                      onMouseEnter={() => setActiveIndex(i)}
                      className={`flex w-full items-center gap-3 border-b border-line px-4 py-3 text-left last:border-b-0 ${
                        i === activeIndex ? "bg-field/70" : ""
                      }`}
                    >
                      {s.data_id ? (
                        <IconPin className="h-4 w-4 shrink-0 text-moss" />
                      ) : (
                        <IconSearch className="h-4 w-4 shrink-0 text-soft" />
                      )}
                      <span className="min-w-0">
                        <span className="block truncate text-[0.875rem] font-medium">{s.value}</span>
                        {s.subtext && (
                          <span className="block truncate font-mono text-[0.68rem] text-soft">
                            {s.subtext}
                          </span>
                        )}
                      </span>
                      {s.data_id && (
                        <IconArrow className="ml-auto h-3.5 w-3.5 shrink-0 text-soft" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* ===== Trạng thái trống ===== */}
        {showEmptyState && (
          <div className="rise mx-auto mt-20 max-w-md text-center">
            <svg viewBox="0 0 120 120" className="mx-auto h-32 w-32" aria-hidden>
              <circle cx="60" cy="60" r="54" fill="none" strokeWidth="1.5" strokeDasharray="3 6" className="stroke-ink/20" />
              <circle cx="60" cy="60" r="38" fill="none" strokeWidth="1.5" strokeDasharray="3 6" className="stroke-ink/20" />
              <path
                d="M60 32c-11 0-19.5 8.7-19.5 19.5C40.5 66 60 84 60 84s19.5-18 19.5-32.5C79.5 40.7 71 32 60 32z"
                className="fill-moss"
              />
              <circle cx="60" cy="51" r="7" className="fill-paper" />
              <ellipse cx="60" cy="92" rx="13" ry="3" className="fill-ink/10" />
            </svg>
            <p className="wide mt-4 font-mono text-[0.7rem] uppercase tracking-[0.22em] text-soft">
              Chưa chọn địa điểm
            </p>
            <p className="mx-auto mt-2 max-w-[38ch] text-[0.9rem] leading-relaxed text-ink/75">
              Gõ tên quán rồi chọn một gợi ý — toàn bộ hồ sơ Google Maps sẽ được trải ra thành
              một bản đồ dữ liệu.
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              <span className="font-mono text-[0.68rem] text-soft">Thử ngay:</span>
              {SAMPLE_QUERIES.map((q) => (
                <button
                  key={q}
                  onClick={() => runSample(q)}
                  className="rounded-full border border-line bg-card px-3 py-1 text-[0.78rem] font-medium text-ink/80 shadow-card transition-colors hover:border-moss/50 hover:text-moss-deep"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ===== Lỗi ===== */}
        {error && !loading && (
          <div className="mx-auto mt-10 max-w-2xl rounded-xl border border-pin/30 bg-card p-5 shadow-card">
            <div className="flex items-start gap-3">
              <IconWarn className="mt-0.5 h-5 w-5 shrink-0 text-pin" />
              <div>
                <p className="font-semibold text-pin">Không lấy được hồ sơ{selectedName ? ` cho “${selectedName}”` : ""}</p>
                <p className="mt-1 break-words text-[0.83rem] text-soft">{error}</p>
                <button
                  onClick={retryProfile}
                  className="mt-3 rounded-lg border border-line px-3.5 py-2 text-[0.83rem] font-medium transition-colors hover:border-moss hover:text-moss-deep"
                >
                  Thử lại
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ===== Đang tải ===== */}
        {loading && <DossierSkeleton />}

        {/* ===== Hồ sơ ===== */}
        {profile && !loading && (
          <>
            {/* --- Nhận diện --- */}
            <div className="rise mt-12 flex flex-col gap-5 sm:flex-row sm:items-start">
              {profile.thumbnail && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.thumbnail}
                  alt={profile.title}
                  className="h-24 w-24 shrink-0 rounded-xl object-cover shadow-pop ring-1 ring-line"
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {profile.types.map((t) => (
                    <Chip key={t} tone="moss">
                      {t}
                    </Chip>
                  ))}
                  {profile.price && <Chip>{profile.price}</Chip>}
                  {profile.unclaimed && (
                    <Chip tone="warn">
                      <IconWarn className="h-3 w-3" /> Chưa xác nhận chủ sở hữu
                    </Chip>
                  )}
                </div>
                <h1 className="wide mt-2 font-display text-3xl font-extrabold leading-tight sm:text-4xl">
                  {profile.title || selectedName}
                </h1>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                  {profile.rating != null && (
                    <span className="flex items-center gap-1.5">
                      <Stars rating={profile.rating} className="h-4 w-4" />
                      <span className="font-display text-[0.95rem] font-bold">{profile.rating}</span>
                      <span className="font-mono text-[0.72rem] text-soft">
                        ({profile.reviews_count?.toLocaleString("vi-VN")} đánh giá)
                      </span>
                    </span>
                  )}
                  {profile.address && (
                    <span className="flex min-w-0 items-center gap-1.5 text-[0.83rem] text-soft">
                      <IconPin className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{profile.address}</span>
                    </span>
                  )}
                </div>
                {profile.description && (
                  <p className="mt-3 max-w-[64ch] text-[0.875rem] leading-relaxed text-ink/80">
                    {profile.description}
                  </p>
                )}
              </div>
            </div>

            <div className="rise rise-1 mt-8">
              <ScaleRule
                label={
                  profile.gps
                    ? `${profile.gps.latitude.toFixed(4)}°N ${profile.gps.longitude.toFixed(4)}°E`
                    : "hồ sơ Google Maps"
                }
              />
            </div>

            {/* --- Lưới hồ sơ --- */}
            <div className="rise rise-2 mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_330px]">
              {/* Cột chính trên xương sống lộ trình */}
              <div className="relative min-w-0 space-y-12">
                <span className="spine absolute bottom-4 left-[7px] top-2 hidden md:block" aria-hidden />
                <ReviewsSection profile={profile} />
                <MenuSection profile={profile} />
                <PopularTimesSection profile={profile} />
                <GallerySection profile={profile} />
                <SimilarSection profile={profile} onSelect={handleSelectSimilar} />
                <AiAuditSection
                  state={ai}
                  onRun={runAiAudit}
                  restaurant={profile.title || selectedName}
                  onRefine={handleRefine}
                  isRefining={isRefining}
                  chatMessages={chatMessages}
                  onResetAudit={handleResetAudit}
                />
                <RawJsonSection raw={raw} />
              </div>

              {/* Bảng chú giải bên phải */}
              <aside className="space-y-5">
                <RatingRail profile={profile} />
                <HoursRail profile={profile} />
                <ContactRail profile={profile} />
                <PriceRail profile={profile} />
                <AmenitiesRail profile={profile} />
              </aside>
            </div>
          </>
        )}
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-4 sm:px-6">
          <p className="wide font-mono text-[0.62rem] uppercase tracking-[0.16em] text-soft">
            Địa Bạ — công cụ khảo sát nội bộ
          </p>
          <p className="font-mono text-[0.62rem] text-soft">
            hồ sơ tổng hợp từ Google Maps
          </p>
        </div>
      </footer>
    </div>
  );
}
