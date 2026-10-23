import { NextResponse } from "next/server";
import { EXTENSION_RELEASE_REPO, EXTENSION_RELEASES_PAGE, pickLatestExtensionRelease, type ExtensionRelease } from "@/lib/extension-release";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GitHub API không token: 60 lượt/giờ/IP → giữ kết quả 10 phút trong instance. */
const CACHE_MS = 10 * 60_000;
let cached: { at: number; release: ExtensionRelease | null } | null = null;

/**
 * Bản extension Địa Bạ mới nhất trên GitHub Releases của repo biz-profile-audit-ext (tag `vX.Y.Z`).
 * Web dùng để hiện nút tải bản mới nhất và nhắc cập nhật khi bản đang cài cũ hơn.
 */
export async function GET() {
  if (cached && Date.now() - cached.at < CACHE_MS) {
    return NextResponse.json({ release: cached.release, releasesPage: EXTENSION_RELEASES_PAGE });
  }
  const headers: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": "diaba-web" };
  const token = process.env.GITHUB_TOKEN?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const res = await fetch(`https://api.github.com/repos/${EXTENSION_RELEASE_REPO}/releases?per_page=30`, {
      headers,
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`GitHub HTTP ${res.status}`);
    const release = pickLatestExtensionRelease(await res.json());
    cached = { at: Date.now(), release };
    return NextResponse.json({ release, releasesPage: EXTENSION_RELEASES_PAGE });
  } catch (err) {
    // GitHub lỗi/hết lượt: trả bản đã biết (nếu có) để web vẫn hiện nút tải; không có thì dẫn sang trang Releases.
    return NextResponse.json(
      { release: cached?.release ?? null, releasesPage: EXTENSION_RELEASES_PAGE, error: (err as Error).message },
      { status: cached?.release ? 200 : 503 },
    );
  }
}
