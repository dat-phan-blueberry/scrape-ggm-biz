/**
 * Cầu nối giao tiếp giữa Web Địa Bạ và Chrome Extension (Địa Bạ Maps Profiler)
 * Dùng để phát hiện extension, gửi lệnh cào ngầm, và gộp dữ liệu bổ sung vào BusinessProfile.
 */

import type { BusinessProfile, MenuCategory, ExtensionGroup } from "./types.ts";
import { compareVersions } from "./extension-release.ts";

export interface ExtensionMenuItem {
  name: string;
  description?: string;
  price?: string;
}

export interface ExtensionMenuCategory {
  section: string;
  items: ExtensionMenuItem[];
}

export interface ExtensionAttributeItem {
  group: string;
  label: string;
}

export interface ExtensionCollectedData {
  menu?: {
    categories?: ExtensionMenuCategory[];
    menuPhotosOnly?: boolean;
    /** Maps đăng nhập có tab Thực đơn nhưng chỉ có món nổi bật/ảnh/link ngoài — không có menu chữ. */
    noTextMenu?: boolean;
    source?: "script" | "ai";
  };
  attributes?: {
    available?: ExtensionAttributeItem[];
    unavailable?: ExtensionAttributeItem[];
    source?: "script" | "ai";
  };
  special_hours?: string[];
  special_hours_source?: "script" | "ai";
}

export interface ExtendedBusinessProfile extends BusinessProfile {
  menu_source_note?: string;
  special_hours?: string[];
}

export const EXTENSION_AMENITIES_KEY = "Tiện ích (Maps đăng nhập)";

/** ID cố định nhờ trường "key" trong manifest.json (repo biz-profile-audit-ext) — cài unpacked ở thư mục nào cũng ra cùng ID. */
export const DIABA_EXTENSION_ID = "coonkgehlckihibjghcejllijbhjjknd";
/**
 * Bản extension tối thiểu web làm việc được (giao thức Port/AI). Cũ hơn bản này thì chặn thu thập và bắt cập nhật;
 * bản mới nhất để gợi ý cập nhật lấy từ GitHub Releases (xem extension-release.ts).
 */
export const REQUIRED_EXTENSION_VERSION = "1.1.0";

function extensionId(): string {
  // Tham chiếu trực tiếp process.env.NEXT_PUBLIC_… để Next nhúng giá trị lúc build.
  const fromEnv = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_DIABA_EXTENSION_ID : undefined;
  return fromEnv?.trim() || DIABA_EXTENSION_ID;
}

/** True khi bản đang cài (hoặc không đọc được bản) cũ hơn REQUIRED_EXTENSION_VERSION. */
export function isExtensionOutdated(version?: string): boolean {
  if (!version) return true;
  return compareVersions(version, REQUIRED_EXTENSION_VERSION) < 0;
}

/**
 * Kiểm tra xem Extension đã được cài đặt và sẵn sàng hoạt động hay chưa
 */
export async function detectExtension(): Promise<{ installed: boolean; version?: string }> {
  const extId = extensionId();
  if (typeof window === "undefined") {
    return { installed: false };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chromeObj = (window as any).chrome;
  if (!chromeObj?.runtime?.sendMessage) {
    return { installed: false };
  }

  return new Promise((resolve) => {
    try {
      chromeObj.runtime.sendMessage(
        extId,
        { type: "diaba:ping" },
        (response: { ok?: boolean; version?: string } | undefined) => {
          if (chromeObj.runtime?.lastError || !response?.ok) {
            resolve({ installed: false });
          } else {
            resolve({ installed: true, version: response.version });
          }
        }
      );
    } catch {
      resolve({ installed: false });
    }
  });
}

export type CollectSection = "menu" | "attributes" | "special_hours";

export const COLLECT_SECTION_LABELS: Record<CollectSection, string> = {
  menu: "Thực đơn chữ (tab Menu)",
  attributes: "Tiện ích (tab Giới thiệu)",
  special_hours: "Giờ đặc biệt (lễ, Tết)",
};

/** Mục nào Google chưa cho lấy từ máy chủ và extension chưa thu thập — chỉ đi lấy những mục này. */
export function missingSections(profile: BusinessProfile): CollectSection[] {
  const p = profile as ExtendedBusinessProfile;
  const out: CollectSection[] = [];
  if (!p.menu_source_note?.startsWith("maps_logged_in")) out.push("menu");
  if (!p.extensions?.some((g) => g.key === EXTENSION_AMENITIES_KEY)) out.push("attributes");
  if (!Array.isArray(p.special_hours)) out.push("special_hours");
  return out;
}

export interface CollectProgress {
  stage: "open" | "loaded" | "section";
  section?: CollectSection;
  status?: "running" | "done" | "failed";
  detail?: string;
}

/** Token gọi thẳng AI Gateway (do /api/ai-token ký); dùng lại tới khi còn dưới 1 phút. */
let gatewayToken: { gatewayUrl: string; token: string; expiresAt: number } | null = null;

async function getGatewayToken(force = false) {
  if (!force && gatewayToken && gatewayToken.expiresAt - Date.now() / 1000 > 60) return gatewayToken;
  const res = await fetch("/api/ai-token", { cache: "no-store" });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.token) throw new Error(data?.error || `Không lấy được token AI (HTTP ${res.status})`);
  gatewayToken = data;
  return data as { gatewayUrl: string; token: string; expiresAt: number };
}

/** Mỗi lượt AI tối đa 24s (extension tự bỏ ở 25s). Không còn đi qua hàm Netlify nên không bị giới hạn ~10s. */
const GATEWAY_CALL_TIMEOUT_MS = 24_000;

/**
 * AI fallback của extension: trình duyệt gọi thẳng AI Gateway (Koyeb) bằng token ngắn hạn.
 * Netlify chỉ ký token (vài ms) sau khi kiểm phiên đăng nhập; key gateway không rời máy chủ.
 */
async function askExtensionLlm(body: unknown): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const { gatewayUrl, token } = await getGatewayToken(attempt > 0);
      const res = await fetch(`${gatewayUrl}/v1/llm/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body ?? {}),
        signal: AbortSignal.timeout(GATEWAY_CALL_TIMEOUT_MS),
      });
      const data = await res.json().catch(() => null);
      if (res.status === 401 && data?.tokenExpired && attempt === 0) continue; // token hết hạn giữa chừng → xin token mới, thử lại 1 lần
      if (!res.ok) return { ok: false, error: `AI Gateway HTTP ${res.status}${data?.error ? `: ${String(data.error).slice(0, 160)}` : ""}` };
      return { ok: true, data };
    }
    return { ok: false, error: "Token AI hết hạn" };
  } catch (err) {
    return { ok: false, error: (err as Error).name === "TimeoutError" ? `AI không phản hồi sau ${GATEWAY_CALL_TIMEOUT_MS / 1000}s` : (err as Error).message };
  }
}

/** Hạn phía web, dài hơn hạn 170s của extension để luôn nhận được kết quả cuối nếu extension còn sống. */
const COLLECT_WEB_TIMEOUT_MS = 180_000;

/**
 * Thu thập qua Port (chrome.runtime.connect): nhận tiến trình từng mục theo thời gian thực.
 * Luôn kết thúc: có kết quả, extension ngắt kết nối, hoặc hết hạn.
 */
export function collectMissingWithProgress(
  mapsUrl: string,
  missing: CollectSection[],
  onProgress: (p: CollectProgress) => void,
): Promise<{ ok: boolean; data?: ExtensionCollectedData; errors?: string[] }> {
  const extId = extensionId();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chromeObj = typeof window !== "undefined" ? (window as any).chrome : undefined;
  if (!chromeObj?.runtime?.connect) {
    return Promise.resolve({ ok: false, errors: ["Chưa kết nối được extension Địa Bạ."] });
  }
  return new Promise((resolve) => {
    let done = false;
    // eslint-disable-next-line prefer-const
    let timer: ReturnType<typeof setTimeout>;
    const finish = (r: { ok: boolean; data?: ExtensionCollectedData; errors?: string[] }) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { port.disconnect(); } catch { /* đã ngắt */ }
      resolve(r);
    };
    const port = chromeObj.runtime.connect(extId, { name: "diaba-collect" });
    timer = setTimeout(() => finish({ ok: false, errors: [`Quá ${COLLECT_WEB_TIMEOUT_MS / 1000}s không nhận được kết quả từ extension.`] }), COLLECT_WEB_TIMEOUT_MS);
    port.onMessage.addListener((msg: { type: string; id?: number; body?: unknown } & CollectProgress & { ok?: boolean; data?: ExtensionCollectedData; errors?: string[] }) => {
      if (msg.type === "progress") onProgress(msg);
      else if (msg.type === "result") finish({ ok: !!msg.ok, data: msg.data, errors: msg.errors });
      else if (msg.type === "llm") {
        // AI fallback của extension đi qua máy chủ Địa Bạ (phiên đăng nhập + key phía server).
        askExtensionLlm(msg.body).then((r) => {
          if (!done) port.postMessage({ type: "llm_result", id: msg.id, ...r });
        });
      }
    });
    port.onDisconnect.addListener(() => finish({ ok: false, errors: [chromeObj.runtime?.lastError?.message || "Extension ngắt kết nối giữa chừng."] }));
    port.postMessage({ type: "diaba:collect", mapsUrl, missing });
  });
}

/**
 * Gửi yêu cầu tới Extension để cào ngầm các thông tin còn thiếu từ Google Maps
 */
export async function collectMissing(
  mapsUrl: string,
  missing: Array<"menu" | "attributes" | "special_hours"> = ["menu", "attributes", "special_hours"]
): Promise<{ ok: boolean; data?: ExtensionCollectedData; steps?: unknown[]; errors?: string[] }> {
  const extId = extensionId();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chromeObj = (window as any).chrome;
  if (!chromeObj?.runtime?.sendMessage) {
    return { ok: false, errors: ["Trình duyệt hiện tại không hỗ trợ API Chrome Runtime."] };
  }

  return new Promise((resolve) => {
    try {
      chromeObj.runtime.sendMessage(
        extId,
        { type: "diaba:collect", mapsUrl, missing },
        (response: { ok: boolean; data?: ExtensionCollectedData; steps?: unknown[]; errors?: string[] } | undefined) => {
          if (chromeObj.runtime?.lastError || !response) {
            resolve({
              ok: false,
              errors: [chromeObj.runtime?.lastError?.message || "Không nhận được phản hồi từ extension."],
            });
          } else {
            resolve(response);
          }
        }
      );
    } catch (err) {
      resolve({ ok: false, errors: [(err as Error).message] });
    }
  });
}

/**
 * Hàm thuần (pure function) ghép dữ liệu thu thập được từ Extension vào BusinessProfile
 */
export function mergeExtensionData(
  profile: BusinessProfile,
  data?: ExtensionCollectedData
): ExtendedBusinessProfile {
  if (!data) {
    return { ...profile };
  }

  const extensions: ExtensionGroup[] = [...(profile.extensions || [])];
  const unsupportedExtensions: ExtensionGroup[] = [...(profile.unsupported_extensions || [])];

  const updated: ExtendedBusinessProfile = {
    ...profile,
    extensions,
    unsupported_extensions: unsupportedExtensions,
  };

  // 1. Ghép thực đơn chữ (Menu)
  if (data.menu) {
    if (Array.isArray(data.menu.categories) && data.menu.categories.length > 0) {
      const mappedCategories: MenuCategory[] = data.menu.categories.map((c) => ({
        title: c.section || "Thực đơn",
        items: (c.items || []).map((it) => ({
          title: it.name || "",
          description: it.description || "",
          price: it.price || "",
        })),
      }));

      const existingMenu = profile.menu || { highlights: [], categories: [] };
      updated.menu = {
        ...existingMenu,
        categories: mappedCategories,
      };
      updated.menu_source_note = "maps_logged_in";
      // Menu chữ thật từ tab Menu thay cho danh sách món nổi bật (chỉ tên) — bỏ dấu để Text Menu được chấm.
      delete updated.menu_origin;
    } else if (data.menu.menuPhotosOnly) {
      if (!updated.menu) {
        updated.menu = { highlights: [], categories: [] };
      }
      updated.menu_source_note = "maps_logged_in_photos_only";
    } else if (data.menu.noTextMenu) {
      updated.menu_source_note = "maps_logged_in_no_text_menu";
    }
  }

  // 2. Ghép tiện ích & dịch vụ (Attributes)
  if (data.attributes) {
    // 2.1 Tiện ích có (available) -> thêm vào profile.extensions với nhóm "Tiện ích (Maps đăng nhập)"
    if (Array.isArray(data.attributes.available) && data.attributes.available.length > 0) {
      const newItems = data.attributes.available.map((a) =>
        a.group && a.label && a.group !== a.label ? `${a.group}: ${a.label}` : a.label
      );

      const existingGroupIndex = extensions.findIndex((g) => g.key === EXTENSION_AMENITIES_KEY);
      if (existingGroupIndex >= 0) {
        const currentGroup = extensions[existingGroupIndex];
        const combined = Array.from(new Set([...currentGroup.items, ...newItems]));
        extensions[existingGroupIndex] = { ...currentGroup, items: combined };
      } else {
        extensions.push({
          key: EXTENSION_AMENITIES_KEY,
          items: Array.from(new Set(newItems)),
        });
      }
      updated.extensions = extensions;
    }

    // 2.2 Tiện ích không có (unavailable) -> thêm vào profile.unsupported_extensions với cùng key
    if (Array.isArray(data.attributes.unavailable) && data.attributes.unavailable.length > 0) {
      const newItems = data.attributes.unavailable.map((a) =>
        a.group && a.label && a.group !== a.label ? `${a.group}: ${a.label}` : a.label
      );

      const existingGroupIndex = unsupportedExtensions.findIndex((g) => g.key === EXTENSION_AMENITIES_KEY);
      if (existingGroupIndex >= 0) {
        const currentGroup = unsupportedExtensions[existingGroupIndex];
        const combined = Array.from(new Set([...currentGroup.items, ...newItems]));
        unsupportedExtensions[existingGroupIndex] = { ...currentGroup, items: combined };
      } else {
        unsupportedExtensions.push({
          key: EXTENSION_AMENITIES_KEY,
          items: Array.from(new Set(newItems)),
        });
      }
      updated.unsupported_extensions = unsupportedExtensions;
    }
  }

  // 3. Ghép Giờ đặc biệt (special_hours) — mảng rỗng nghĩa là đã kiểm tra, không thấy giờ lễ tuần này (để không đòi lấy lại).
  if (Array.isArray(data.special_hours)) {
    updated.special_hours = [...data.special_hours];
  }

  return updated;
}
