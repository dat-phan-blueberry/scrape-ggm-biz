import { compareVersions, detectBrowser, pickLatestExtensionRelease } from "../src/lib/extension-release.ts";

function equal<T>(actual: T, expected: T) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const asset = (v: string) => [{ name: `diaba-extension-v${v}.zip`, browser_download_url: `https://github.com/x/y/releases/download/v${v}/diaba-extension-v${v}.zip` }];

Deno.test("Release mới nhất: chỉ tag vX.Y.Z có zip, bỏ draft/prerelease/tag lạ, so theo số chứ không theo chữ", () => {
  const latest = pickLatestExtensionRelease([
    { tag_name: "nightly", assets: asset("9.9.9") }, // tag không phải phiên bản
    { tag_name: "v3.0.0-beta", assets: asset("3.0.0") }, // không đúng dạng X.Y.Z
    { tag_name: "v1.9.0", assets: asset("1.9.0") },
    { tag_name: "v1.10.0", assets: asset("1.10.0"), html_url: "https://github.com/x/y/releases/tag/v1.10.0" },
    { tag_name: "v2.0.0", draft: true, assets: asset("2.0.0") },
    { tag_name: "v1.11.0", prerelease: true, assets: asset("1.11.0") },
    { tag_name: "v1.12.0", assets: [] }, // chưa đính kèm zip
  ]);
  equal(latest?.version, "1.10.0");
  equal(latest?.downloadUrl.endsWith("diaba-extension-v1.10.0.zip"), true);
  equal(pickLatestExtensionRelease([]), null);
  equal(pickLatestExtensionRelease({ message: "API rate limit exceeded" }), null);
});

Deno.test("So phiên bản a.b.c theo số", () => {
  equal(compareVersions("1.1.0", "1.10.0") < 0, true);
  equal(compareVersions("1.2", "1.2.0"), 0);
  equal(compareVersions("2.0.0", "1.99.99") > 0, true);
});

Deno.test("Nhận diện trình duyệt: trang tiện ích đúng scheme, Firefox/Safari/điện thoại báo chưa hỗ trợ", () => {
  const chromeUA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
  equal(detectBrowser(chromeUA).extensionsUrl, "chrome://extensions");
  equal(detectBrowser(chromeUA, true).extensionsUrl, "brave://extensions");
  equal(detectBrowser(`${chromeUA} Edg/141.0.0.0`).extensionsUrl, "edge://extensions");
  equal(detectBrowser(`${chromeUA} Edg/141.0.0.0`).guide, "edge");
  equal(detectBrowser(`${chromeUA} OPR/120.0.0.0`).extensionsUrl, "opera://extensions");
  equal(detectBrowser(chromeUA.replace("Chrome/", "coc_coc_browser/140.0.0 Chrome/")).name, "Cốc Cốc");
  equal(detectBrowser("Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0").supported, false);
  equal(detectBrowser("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15").supported, false);
  equal(detectBrowser("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36").supported, false);
});
