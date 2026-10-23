"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { IconCompass, IconDownload, IconWarn, IconX } from "@/components/ui";
import { REQUIRED_EXTENSION_VERSION } from "@/lib/extension-bridge";
import { detectBrowser, type BrowserInfo, type ExtensionRelease } from "@/lib/extension-release";

/**
 * - install: chưa cài → chặn thu thập.
 * - required-update: bản cài cũ hơn bản tối thiểu web cần → chặn thu thập.
 * - update: dùng được nhưng GitHub có bản mới hơn → gợi ý, không chặn.
 */
export type ExtensionPanelMode = "install" | "required-update" | "update";

function useBrowser(): BrowserInfo | null {
  const [browser, setBrowser] = useState<BrowserInfo | null>(null);
  useEffect(() => {
    // Brave giấu tên trong user agent, chỉ lộ qua navigator.brave.
    const nav = navigator as Navigator & { brave?: { isBrave?: () => Promise<boolean> } };
    const ua = navigator.userAgent;
    setBrowser(detectBrowser(ua));
    nav.brave?.isBrave?.().then((yes) => { if (yes) setBrowser(detectBrowser(ua, true)); }).catch(() => {});
  }, []);
  return browser;
}

export function ExtensionPanel({
  mode,
  installedVersion,
  release,
  releasesPage,
  checking,
  onRecheck,
}: {
  mode: ExtensionPanelMode;
  installedVersion?: string;
  release: ExtensionRelease | null;
  releasesPage: string;
  checking: boolean;
  onRecheck: () => void;
}) {
  const browser = useBrowser();
  const [copied, setCopied] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const updating = mode !== "install";
  const shownInstalled = installedVersion && /^\d/.test(installedVersion) ? `v${installedVersion}` : "bản cũ";

  const title =
    mode === "install"
      ? "Cài extension Địa Bạ để lấy Menu chữ, Tiện ích và Giờ đặc biệt"
      : mode === "required-update"
        ? `Extension Địa Bạ cần cập nhật (đang ${shownInstalled}, cần từ v${REQUIRED_EXTENSION_VERSION})`
        : `Có bản extension mới${release ? ` v${release.version}` : ""} (đang ${shownInstalled})`;

  const copyExtensionsUrl = () => {
    if (!browser?.extensionsUrl) return;
    navigator.clipboard?.writeText(browser.extensionsUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 6000);
    });
  };

  const compact = mode === "update";
  return (
    <div className={`rise rise-1 mt-6 rounded-xl border p-4 ${compact ? "border-line bg-card/60" : "border-amber/40 bg-amber/5"}`}>
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber/15 text-amber">
          {mode === "install" ? <IconCompass className="h-5 w-5" /> : <IconWarn className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.875rem] font-semibold text-ink">{title}</p>
          {!compact && (
            <p className="mt-0.5 text-[0.75rem] text-soft">
              Google chỉ hiện các mục này khi đăng nhập Maps. Extension mở Maps bằng tài khoản Google trên trình duyệt của bạn và đọc giúp.
            </p>
          )}

          {browser && !browser.supported ? (
            <p className="mt-3 text-[0.78rem] font-medium text-pin">
              {browser.name} chưa dùng được extension Địa Bạ. Mở Địa Bạ bằng Google Chrome, Microsoft Edge hoặc Brave trên máy tính.
            </p>
          ) : (
            <>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <a
                  href={release?.downloadUrl || releasesPage}
                  target={release ? undefined : "_blank"}
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-moss px-3 py-1.5 text-[0.78rem] font-medium text-paper hover:opacity-90"
                >
                  <IconDownload className="h-3.5 w-3.5" />
                  {release ? `Tải extension v${release.version}` : "Tải extension (trang phát hành)"}
                </a>
                {browser?.extensionsUrl && (
                  <button
                    type="button"
                    onClick={copyExtensionsUrl}
                    className="rounded-lg border border-line bg-card px-3 py-1.5 text-[0.78rem] font-medium text-ink hover:bg-field"
                  >
                    Mở trang tiện ích của {browser.name}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setGuideOpen(true)}
                  className="rounded-lg border border-line bg-card px-3 py-1.5 text-[0.78rem] font-medium text-ink hover:bg-field"
                >
                  Xem hướng dẫn
                </button>
                <button
                  type="button"
                  onClick={onRecheck}
                  disabled={checking}
                  className="px-1.5 py-1.5 text-[0.75rem] font-medium text-soft underline-offset-2 hover:underline disabled:opacity-50"
                >
                  {checking ? "Đang kiểm tra…" : updating ? "Đã cập nhật xong" : "Đã cài xong"}
                </button>
              </div>
              {copied && browser?.extensionsUrl && (
                <p className="mt-2 text-[0.75rem] text-moss-deep">
                  Đã sao chép <code className="rounded bg-field px-1 font-mono">{browser.extensionsUrl}</code>. Mở tab mới (Ctrl+T), dán (Ctrl+V) rồi Enter — trình duyệt không cho trang web tự mở trang này.
                </p>
              )}
            </>
          )}
        </div>
      </div>
      {guideOpen && browser && (
        <InstallGuide
          browser={browser}
          updating={updating}
          version={release?.version}
          onClose={() => setGuideOpen(false)}
          onDone={() => { setGuideOpen(false); onRecheck(); }}
        />
      )}
    </div>
  );
}

function InstallGuide({
  browser,
  updating,
  version,
  onClose,
  onDone,
}: {
  browser: BrowserInfo;
  updating: boolean;
  version?: string;
  onClose: () => void;
  onDone: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const page = browser.extensionsUrl || "chrome://extensions";
  const folder = `diaba-extension-v${version || "x.y.z"}`;
  // Cài và cập nhật cùng thao tác: kéo thư mục bản mới vào là trình duyệt thay bản cũ (cùng ID nhờ "key" trong manifest).
  const gif = `/guides/extension-install-${browser.guide}.gif`;
  const steps = [
    <>Bấm <b>Tải extension</b> để tải file <b>{folder}.zip</b>.</>,
    <>Chuột phải file zip → <b>Giải nén tất cả</b> (Extract All) → <b>Giải nén</b>. Được thư mục <b>{folder}</b>; để ở chỗ cố định, đừng xoá.</>,
    <>Mở <code className="font-mono">{page}</code> (nút <b>Mở trang tiện ích</b> đã sao chép sẵn địa chỉ) và bật <b>{browser.devModeLabel}</b>.</>,
    // Edge không hiện lớp "thả để cài" khi kéo thư mục (đã kiểm) → hướng dẫn bằng nút.
    browser.guide === "edge"
      ? <>Bấm <b>{browser.loadUnpackedLabel}</b>, chọn thư mục <b>{folder}</b> rồi bấm <b>Chọn thư mục</b>.</>
      : <>Kéo thư mục <b>{folder}</b> thả vào trang tiện ích. Hoặc bấm <b>{browser.loadUnpackedLabel}</b> rồi chọn thư mục đó.</>,
    <>Quay lại Địa Bạ, bấm <b>{updating ? "Đã cập nhật xong" : "Đã cài xong"}</b>.{updating ? " Bản mới tự thay bản cũ; có thể xoá thư mục bản cũ." : ""}</>,
  ];

  // Portal ra body: khung cha có hiệu ứng .rise (transform) làm position:fixed bám theo khung thay vì cả màn hình.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label="Hướng dẫn cài extension">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-paper p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <p className="text-[1rem] font-semibold text-ink">
            {updating ? "Cập nhật" : "Cài"} extension Địa Bạ trên {browser.name}
          </p>
          <button type="button" onClick={onClose} aria-label="Đóng" className="rounded-md p-1 text-soft hover:bg-field">
            <IconX className="h-4 w-4" />
          </button>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={gif} alt={`Các bước ${updating ? "cập nhật" : "cài"} extension trên ${browser.name}`} className="mt-3 w-full rounded-lg border border-line" />
        <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-[0.82rem] text-ink">
          {steps.map((s, i) => <li key={i}>{s}</li>)}
        </ol>
        <div className="mt-4 flex justify-end">
          <button type="button" onClick={onDone} className="rounded-lg bg-moss px-4 py-2 text-[0.82rem] font-medium text-paper hover:opacity-90">
            {updating ? "Đã cập nhật xong — kiểm tra lại" : "Đã cài xong — kiểm tra lại"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
