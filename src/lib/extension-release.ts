/**
 * Phát hành extension Địa Bạ qua GitHub Releases của repo public riêng và hướng dẫn cài theo trình duyệt.
 * Source + CI/CD ở github.com/dat-phan-blueberry/biz-profile-audit-ext: push lên main có đổi extension/ → tự chọn version → Release `vX.Y.Z` kèm zip.
 */

export const EXTENSION_RELEASE_REPO = "dat-phan-blueberry/biz-profile-audit-ext";
export const EXTENSION_TAG_PREFIX = "v";
export const EXTENSION_RELEASES_PAGE = `https://github.com/${EXTENSION_RELEASE_REPO}/releases`;

export interface ExtensionRelease {
  version: string;
  tag: string;
  downloadUrl: string;
  releaseUrl: string;
  publishedAt?: string;
}

/** So phiên bản a.b.c: âm khi a < b, 0 khi bằng, dương khi a > b. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length, 3); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d;
  }
  return 0;
}

interface GitHubRelease {
  tag_name?: string;
  draft?: boolean;
  prerelease?: boolean;
  html_url?: string;
  published_at?: string;
  assets?: Array<{ name?: string; browser_download_url?: string }>;
}

/**
 * Chọn bản extension mới nhất trong danh sách release của repo.
 * Chỉ nhận tag `vX.Y.Z` đã phát hành chính thức và có file .zip đính kèm (bỏ draft, prerelease, tag lạ).
 */
export function pickLatestExtensionRelease(releases: unknown): ExtensionRelease | null {
  if (!Array.isArray(releases)) return null;
  let best: ExtensionRelease | null = null;
  for (const r of releases as GitHubRelease[]) {
    if (!r?.tag_name?.startsWith(EXTENSION_TAG_PREFIX) || r.draft || r.prerelease) continue;
    const version = r.tag_name.slice(EXTENSION_TAG_PREFIX.length);
    if (!/^\d+\.\d+\.\d+$/.test(version)) continue;
    const zip = r.assets?.find((a) => a?.name?.endsWith(".zip") && a.browser_download_url);
    if (!zip?.browser_download_url) continue;
    if (best && compareVersions(version, best.version) <= 0) continue;
    best = {
      version,
      tag: r.tag_name,
      downloadUrl: zip.browser_download_url,
      releaseUrl: r.html_url || `${EXTENSION_RELEASES_PAGE}/tag/${r.tag_name}`,
      publishedAt: r.published_at,
    };
  }
  return best;
}

export type BrowserId = "chrome" | "edge" | "brave" | "opera" | "coccoc" | "vivaldi" | "chromium" | "firefox" | "safari" | "other";

export interface BrowserInfo {
  id: BrowserId;
  name: string;
  /** Trang quản lý tiện ích; trang web không mở trực tiếp được, chỉ sao chép để dán. */
  extensionsUrl?: string;
  /** Có cài được extension Địa Bạ (Chromium: Load unpacked + externally_connectable). */
  supported: boolean;
  /** GIF hướng dẫn trong public/guides (trình duyệt Chromium khác dùng bản Chrome). */
  guide: "chrome" | "edge" | "brave";
  /** Nhãn trên trang tiện ích (giao diện tiếng Việt, kèm tiếng Anh). */
  devModeLabel: string;
  loadUnpackedLabel: string;
}

const CHROMIUM_LABELS = {
  devModeLabel: "Chế độ dành cho nhà phát triển (Developer mode)",
  loadUnpackedLabel: "Tải tiện ích đã giải nén (Load unpacked)",
};
const EDGE_LABELS = {
  devModeLabel: "Chế độ nhà phát triển (Developer mode)",
  loadUnpackedLabel: "Tải phần mở rộng đã giải nén (Load unpacked)",
};

/**
 * Nhận diện trình duyệt từ user agent (Brave không ghi tên trong UA: truyền isBrave từ navigator.brave).
 * Firefox không hỗ trợ externally_connectable, Safari cần đóng gói app qua Xcode → chưa hỗ trợ.
 */
export function detectBrowser(userAgent: string, isBrave = false): BrowserInfo {
  const ua = userAgent || "";
  if (/Firefox\//.test(ua) && !/Seamonkey/i.test(ua)) return { id: "firefox", name: "Firefox", extensionsUrl: "about:addons", supported: false, guide: "chrome", ...CHROMIUM_LABELS };
  if (/Edg\//.test(ua)) return { id: "edge", name: "Microsoft Edge", extensionsUrl: "edge://extensions", supported: true, guide: "edge", ...EDGE_LABELS };
  if (/OPR\//.test(ua)) return { id: "opera", name: "Opera", extensionsUrl: "opera://extensions", supported: true, guide: "chrome", ...CHROMIUM_LABELS };
  if (/coc_coc_browser/i.test(ua)) return { id: "coccoc", name: "Cốc Cốc", extensionsUrl: "chrome://extensions", supported: true, guide: "chrome", ...CHROMIUM_LABELS };
  if (/Vivaldi\//.test(ua)) return { id: "vivaldi", name: "Vivaldi", extensionsUrl: "vivaldi://extensions", supported: true, guide: "chrome", ...CHROMIUM_LABELS };
  if (isBrave) return { id: "brave", name: "Brave", extensionsUrl: "brave://extensions", supported: true, guide: "brave", ...CHROMIUM_LABELS };
  if (/Chromium\//.test(ua)) return { id: "chromium", name: "Chromium", extensionsUrl: "chrome://extensions", supported: true, guide: "chrome", ...CHROMIUM_LABELS };
  if (/Chrome\//.test(ua) || /CriOS\//.test(ua)) {
    const mobile = /Android|iPhone|iPad|CriOS/.test(ua);
    return { id: "chrome", name: "Google Chrome", extensionsUrl: mobile ? undefined : "chrome://extensions", supported: !mobile, guide: "chrome", ...CHROMIUM_LABELS };
  }
  if (/Safari\//.test(ua) && /Version\//.test(ua)) return { id: "safari", name: "Safari", supported: false, guide: "chrome", ...CHROMIUM_LABELS };
  return { id: "other", name: "trình duyệt này", supported: false, guide: "chrome", ...CHROMIUM_LABELS };
}
