// Quay GIF hướng dẫn cài extension Địa Bạ cho Chrome / Edge / Brave → public/guides/extension-install-<browser>.gif
//
// Nền là trang tiện ích THẬT của từng trình duyệt (giao diện tiếng Việt): bật Chế độ nhà phát triển bằng click thật,
// lớp "Thả để cài" thật, cài extension thật (CDP Extensions.loadUnpacked), trang Địa Bạ thật sau khi cài.
// Lớp chú thích / con trỏ / thư mục đang kéo và cửa sổ Windows Explorer là hình vẽ minh hoạ.
//
// Cần: dev server Địa Bạ ở http://localhost:3000 (AUTH_USERS="qa@local:qa-dev-2110"), ffmpeg trong PATH,
// playwright-core (NODE_PATH trỏ tới node_modules có playwright-core), trình duyệt cài ở đường dẫn mặc định,
// source extension: repo biz-profile-audit-ext clone trong thư mục này như ai-gateway (hoặc đặt EXT_REPO=<đường dẫn>).
//   node scripts/record-extension-guides.cjs [chrome edge brave]
const { chromium } = require("playwright-core");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const EXT_SRC = path.join(process.env.EXT_REPO || path.join(ROOT, "biz-profile-audit-ext"), "extension");
const VERSION = JSON.parse(fs.readFileSync(path.join(EXT_SRC, "manifest.json"), "utf8")).version;
const FOLDER = `diaba-extension-v${VERSION}`;
const OUT_DIR = path.join(ROOT, "public", "guides");
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), "diaba-guides-"));
const W = 1280, H = 760;
const LOGIN = { user: "qa@local", pass: "qa-dev-2110" };
const PLACE = "Chuyện Ba Bữa Signature";

const BROWSERS = {
  // installBy "drag": trình duyệt hiện lớp "Thả để cài đặt" khi kéo thư mục vào (đã kiểm Chrome, Brave).
  // "button": Edge không hiện lớp thả → hướng dẫn bấm nút tải bản giải nén rồi chọn thư mục.
  chrome: { exe: "C:/Program Files/Google/Chrome/Application/chrome.exe", scheme: "chrome", name: "Chrome", toggleId: "devMode", devLabel: "Chế độ dành cho nhà phát triển", installBy: "drag" },
  edge: { exe: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", scheme: "edge", name: "Edge", toggleId: "dev-switch", devLabel: "Chế độ nhà phát triển", installBy: "button", loadLabel: "Tải phần mở rộng đã giải nén" },
  brave: { exe: "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe", scheme: "brave", name: "Brave", toggleId: "devMode", devLabel: "Chế độ dành cho nhà phát triển", installBy: "drag" },
};

// Thư mục extension giống hệt thứ sale có sau khi giải nén zip phẳng.
const EXT_DIR = path.join(WORK, FOLDER);
fs.cpSync(EXT_SRC, EXT_DIR, { recursive: true });

/* ---------- Lớp vẽ đè (chạy trong trang) ---------- */
function drawOverlay(o) {
  document.getElementById("__guide")?.remove();
  const el = (tag, style, parent) => { const e = document.createElement(tag); Object.assign(e.style, style); (parent || root).append(e); return e; };
  const root = document.createElement("div");
  root.id = "__guide";
  Object.assign(root.style, { position: "fixed", inset: "0", pointerEvents: "none", zIndex: "2147483647", fontFamily: "'Segoe UI', system-ui, sans-serif" });
  const folderIcon = (parent, size) => {
    const f = el("div", { position: "relative", width: `${size}px`, height: `${size * 0.75}px` }, parent);
    el("div", { position: "absolute", left: "0", top: "0", width: "45%", height: "22%", background: "#e0a924", borderRadius: "3px 3px 0 0" }, f);
    el("div", { position: "absolute", left: "0", top: "14%", right: "0", bottom: "0", background: "#f6c344", borderRadius: "3px" }, f);
    return f;
  };
  if (o.ring) {
    const r = o.ring;
    el("div", { position: "fixed", left: `${r.x - 8}px`, top: `${r.y - 8}px`, width: `${r.w + 16}px`, height: `${r.h + 16}px`, border: "4px solid #f59e0b", borderRadius: "12px", boxShadow: "0 0 0 8px rgba(245,158,11,.25)" });
  }
  if (o.mini) {
    const win = el("div", { position: "fixed", left: "36px", top: "380px", width: "330px", background: "#fff", border: "1px solid #c9c9c9", borderRadius: "10px", boxShadow: "0 12px 40px rgba(0,0,0,.28)", overflow: "hidden" });
    el("div", { background: "#eef1f6", padding: "8px 12px", fontSize: "13px", color: "#222" }, win).textContent = "Tải xuống";
    const row = el("div", { display: "flex", alignItems: "center", gap: "10px", margin: "12px", padding: "8px", background: o.ghost ? "transparent" : "#cce4f7", borderRadius: "6px" }, win);
    folderIcon(row, 34);
    el("span", { fontSize: "14px", color: "#111" }, row).textContent = o.folder;
  }
  if (o.ghost) {
    const g = el("div", { position: "fixed", left: `${o.ghost.x - 24}px`, top: `${o.ghost.y - 20}px`, display: "flex", alignItems: "center", gap: "8px", padding: "6px 10px", background: "rgba(204,228,247,.92)", border: "1px solid #7fb6e6", borderRadius: "6px", opacity: ".95" });
    folderIcon(g, 30);
    el("span", { fontSize: "14px", color: "#111" }, g).textContent = o.folder;
  }
  if (o.picker) {
    el("div", { position: "fixed", inset: "0", background: "rgba(0,0,0,.25)" });
    const d = el("div", { position: "fixed", left: "290px", top: "120px", width: "700px", background: "#fff", color: "#111", border: "1px solid #bbb", borderRadius: "8px", boxShadow: "0 16px 48px rgba(0,0,0,.35)", fontSize: "14px", overflow: "hidden" });
    el("div", { padding: "10px 16px", background: "#f3f3f3" }, d).textContent = "Chọn thư mục tiện ích";
    el("div", { padding: "8px 16px", borderBottom: "1px solid #e5e5e5", color: "#444" }, d).textContent = "Máy tính này › Tải xuống";
    const row = el("div", { display: "flex", alignItems: "center", gap: "10px", margin: "12px 16px", padding: "8px", background: "#cce4f7", borderRadius: "4px" }, d);
    folderIcon(row, 24);
    el("span", {}, row).textContent = o.folder;
    const foot = el("div", { display: "flex", justifyContent: "flex-end", gap: "10px", padding: "14px 16px", borderTop: "1px solid #e5e5e5" }, d);
    el("span", { padding: "6px 18px", background: "#0067c0", color: "#fff", borderRadius: "4px", outline: "3px solid #f59e0b", outlineOffset: "3px" }, foot).textContent = "Chọn thư mục";
    el("span", { padding: "6px 18px", border: "1px solid #bbb", borderRadius: "4px" }, foot).textContent = "Huỷ";
  }
  if (o.cursor) {
    if (o.click) el("div", { position: "fixed", left: `${o.cursor.x - 18}px`, top: `${o.cursor.y - 18}px`, width: "36px", height: "36px", borderRadius: "50%", background: "rgba(245,158,11,.45)" });
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "28"); svg.setAttribute("height", "34"); svg.setAttribute("viewBox", "0 0 20 26");
    Object.assign(svg.style, { position: "fixed", left: `${o.cursor.x}px`, top: `${o.cursor.y}px`, filter: "drop-shadow(0 2px 2px rgba(0,0,0,.35))" });
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", "M1 1 L1 20 L6 15.5 L9.5 23.5 L13 22 L9.5 14 L16 14 Z");
    p.setAttribute("fill", "#fff"); p.setAttribute("stroke", "#111"); p.setAttribute("stroke-width", "1.4"); p.setAttribute("stroke-linejoin", "round");
    svg.append(p); root.append(svg);
  }
  if (o.caption) {
    const bar = el("div", { position: "fixed", left: "0", right: "0", bottom: "0", display: "flex", alignItems: "center", gap: "14px", padding: "16px 24px", background: "rgba(22,28,25,.93)", color: "#fff", fontSize: "22px", fontWeight: "600" });
    if (o.step) el("span", { flex: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", width: "36px", height: "36px", borderRadius: "50%", background: "#2f6b4f", fontSize: "19px" }, bar).textContent = String(o.step);
    el("span", {}, bar).textContent = o.caption;
  }
  document.documentElement.append(root);
}

/** Tìm phần tử theo id / nhãn / text, xuyên shadow DOM; trả về khung chữ nhật. */
function findRect(q) {
  const hits = [];
  const walk = (root) => {
    for (const e of root.querySelectorAll("*")) {
      const r = e.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        if (q.id && e.id === q.id) hits.push(r);
        else if (q.tag && e.tagName === q.tag) hits.push(r);
        else if (q.aria && (e.getAttribute("aria-label") || "").startsWith(q.aria) && r.width > 300) hits.push(r);
        else if (q.text && e.childElementCount === 0 && (e.textContent || "").trim() === q.text) hits.push(r);
      }
      if (e.shadowRoot) walk(e.shadowRoot);
    }
  };
  walk(document);
  const r = hits[0];
  return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
}

const union = (a, b) => {
  if (!a || !b) return a || b;
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
};
const center = (r) => ({ x: Math.round(r.x + r.w / 2), y: Math.round(r.y + r.h / 2) });

/* ---------- Cửa sổ Windows Explorer minh hoạ ---------- */
function explorerHtml(state) {
  const zipRow = `<tr class="${state === "select" || state === "menu" ? "sel" : ""}"><td><span class="zip"></span>${FOLDER}.zip</td><td>Hôm nay 09:12</td><td>Thư mục nén (zipped)</td><td>21 KB</td></tr>`;
  const dirRow = `<tr class="sel"><td><span class="dir"></span>${FOLDER}</td><td>Hôm nay 09:13</td><td>Thư mục tệp</td><td></td></tr>`;
  const zipPlain = zipRow.replace(' class="sel"', "");
  const rows = state === "done" ? dirRow + zipPlain : zipRow;
  const menu = state === "menu" ? `<div class="menu" style="left:420px;top:150px"><div>Mở</div><div class="hot">Giải nén tất cả...</div><div>Chia sẻ</div><div>Đổi tên</div><div>Xoá</div><div>Thuộc tính</div></div>` : "";
  const dialog = state === "dialog" ? `<div class="dlg"><h3>Giải nén Thư mục Nén (Zipped)</h3><p>Chọn đích và giải nén tệp</p><p>Tệp sẽ được giải nén vào thư mục này:</p><div class="path">C:\\Users\\Sale\\Downloads\\${FOLDER}</div><label><input type="checkbox" checked> Hiển thị tệp đã giải nén khi hoàn tất</label><div class="btns"><span class="hotbtn">Giải nén</span><span>Huỷ</span></div></div>` : "";
  return `<!doctype html><meta charset="utf-8"><style>
  body{margin:0;background:#4a6d8c;font-family:'Segoe UI',sans-serif;height:${H}px}
  .win{position:absolute;left:60px;top:40px;width:1160px;height:600px;background:#fff;border-radius:10px;box-shadow:0 20px 60px rgba(0,0,0,.35);overflow:hidden}
  .bar{height:44px;background:#eef1f6;display:flex;align-items:center;padding:0 16px;font-size:14px;gap:12px}
  .addr{flex:1;background:#fff;border:1px solid #d6d6d6;border-radius:6px;padding:5px 10px;font-size:13px}
  .side{position:absolute;left:0;top:44px;bottom:0;width:200px;background:#f7f9fc;padding:12px;font-size:14px}
  .side div{padding:6px 10px;border-radius:6px}.side .on{background:#dde7f3}
  table{position:absolute;left:220px;top:60px;width:900px;border-collapse:collapse;font-size:14px}
  th{text-align:left;color:#555;font-weight:400;padding:6px;border-bottom:1px solid #e5e5e5}
  td{padding:8px 6px}tr.sel td{background:#cce4f7}
  .zip,.dir{display:inline-block;width:20px;height:16px;margin-right:10px;vertical-align:-3px;border-radius:2px}
  .zip{background:repeating-linear-gradient(90deg,#f6c344 0 6px,#8a6d1b 6px 8px)}.dir{background:#f6c344}
  .menu{position:absolute;background:#fff;border:1px solid #d0d0d0;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.2);padding:6px;font-size:14px;width:220px}
  .menu div{padding:8px 12px;border-radius:5px}.menu .hot{background:#cce4f7;outline:3px solid #f59e0b}
  .dlg{position:absolute;left:330px;top:150px;width:600px;background:#fff;border:1px solid #bbb;border-radius:8px;box-shadow:0 16px 48px rgba(0,0,0,.3);padding:20px 28px;font-size:14px}
  .dlg h3{margin:0 0 12px;font-weight:600}.path{border:1px solid #bbb;padding:6px 8px;margin:6px 0 14px;border-radius:4px}
  .btns{display:flex;justify-content:flex-end;gap:10px;margin-top:18px}.btns span{padding:6px 22px;border:1px solid #bbb;border-radius:5px}
  .hotbtn{background:#0067c0;color:#fff;border-color:#0067c0!important;outline:3px solid #f59e0b;outline-offset:3px}
  </style><div class="win"><div class="bar">📁 Tải xuống<div class="addr">Máy tính này › Tải xuống</div></div>
  <div class="side"><div>Trang chủ</div><div>Màn hình nền</div><div class="on">Tải xuống</div><div>Tài liệu</div></div>
  <table><tr><th>Tên</th><th>Ngày sửa đổi</th><th>Loại</th><th>Kích thước</th></tr>${rows}</table>${menu}${dialog}</div>`;
}

/* ---------- Thanh địa chỉ minh hoạ ---------- */
function addressBarHtml(scheme) {
  return `<!doctype html><meta charset="utf-8"><style>
  body{margin:0;background:#fff;font-family:'Segoe UI',sans-serif;height:${H}px}
  .top{background:#dfe3e8;padding:10px 14px 0}.tab{display:inline-block;background:#fff;border-radius:10px 10px 0 0;padding:9px 18px;font-size:14px}
  .nav{background:#fff;padding:10px 14px;border-bottom:1px solid #ddd}
  .url{background:#eef1f6;border-radius:20px;padding:10px 18px;font-size:20px;outline:4px solid #f59e0b;outline-offset:3px;width:560px}
  .url b{font-weight:600}.caret{display:inline-block;width:2px;height:22px;background:#111;vertical-align:-4px;margin-left:2px}
  </style><div class="top"><span class="tab">Thẻ mới</span></div><div class="nav"><div class="url"><b>${scheme}://extensions</b><span class="caret"></span></div></div>`;
}

async function recordBrowser(id) {
  const b = BROWSERS[id];
  if (!fs.existsSync(b.exe)) { console.log(`[guides] bỏ qua ${id}: không có ${b.exe}`); return; }
  const dir = path.join(WORK, `frames-${id}`);
  fs.mkdirSync(dir, { recursive: true });
  const frames = [];
  const profile = path.join(WORK, `profile-${id}`);
  const ctx = await chromium.launchPersistentContext(profile, {
    executablePath: b.exe, headless: false, viewport: { width: W, height: H }, locale: "vi-VN", colorScheme: "light",
    args: ["--lang=vi", "--enable-unsafe-extension-debugging", "--no-first-run", "--no-default-browser-check"],
    ignoreDefaultArgs: ["--disable-extensions", "--disable-component-extensions-with-background-pages"],
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  const shot = async (ms, overlay) => {
    if (overlay) await page.evaluate(drawOverlay, { folder: FOLDER, ...overlay });
    await page.waitForTimeout(120);
    const file = path.join(dir, `${String(frames.length).padStart(3, "0")}.png`);
    await page.screenshot({ path: file });
    frames.push({ file, ms });
  };

  // 1. Giải nén (minh hoạ Explorer)
  await page.setContent(explorerHtml("select"));
  await shot(1600, { step: 1, caption: `Mở thư mục Tải xuống, chuột phải file ${FOLDER}.zip`, cursor: { x: 330, y: 132 } });
  await page.setContent(explorerHtml("menu"));
  await shot(1600, { step: 1, caption: "Chọn Giải nén tất cả...", cursor: { x: 520, y: 205 } });
  await page.setContent(explorerHtml("dialog"));
  await shot(1600, { step: 1, caption: "Bấm Giải nén", cursor: { x: 800, y: 418 }, click: true });
  await page.setContent(explorerHtml("done"));
  await shot(2000, { step: 1, caption: `Được thư mục ${FOLDER} — để nguyên, đừng xoá`, cursor: { x: 360, y: 132 } });

  // 2. Mở trang tiện ích + bật chế độ nhà phát triển (trang thật)
  await page.setContent(addressBarHtml(b.scheme));
  await shot(1800, { step: 2, caption: `Mở thẻ mới, dán ${b.scheme}://extensions rồi Enter` });
  await page.goto(`${b.scheme}://extensions`);
  await page.waitForTimeout(2000);
  const toggle = await page.evaluate(findRect, { id: b.toggleId });
  const label = await page.evaluate(findRect, { text: b.devLabel });
  const toggleRing = union(toggle, label);
  const tc = center(toggle);
  await shot(1800, { step: 2, caption: `Bật ${b.devLabel}`, ring: toggleRing, cursor: { x: tc.x - 6, y: tc.y + 4 } });
  await page.evaluate(() => document.getElementById("__guide")?.remove());
  await page.mouse.click(tc.x, tc.y);
  await page.waitForTimeout(900);
  await shot(1200, { step: 2, caption: `Bật ${b.devLabel}`, ring: await page.evaluate(findRect, { id: b.toggleId }).then((t) => union(t, label)), cursor: { x: tc.x - 6, y: tc.y + 4 }, click: true });

  // 3. Cài thư mục: kéo thả (Chrome/Brave) hoặc nút tải bản giải nén (Edge)
  const cdp = await ctx.newCDPSession(page);
  if (b.installBy === "drag") {
    await shot(1300, { step: 3, caption: `Kéo thư mục ${FOLDER} thả vào trang`, mini: true, cursor: { x: 150, y: 452 } });
    const from = { x: 150, y: 440 }, to = { x: W / 2, y: H / 2 - 30 };
    for (let i = 1; i <= 6; i++) {
      const t = i / 6;
      const p = { x: Math.round(from.x + (to.x - from.x) * t), y: Math.round(from.y + (to.y - from.y) * t) };
      await shot(140, { step: 3, caption: `Kéo thư mục ${FOLDER} thả vào trang`, mini: true, ghost: p, cursor: { x: p.x + 4, y: p.y + 4 } });
    }
    const drag = { items: [], files: [EXT_DIR], dragOperationsMask: 1 };
    await page.evaluate(() => document.getElementById("__guide")?.remove());
    for (const type of ["dragEnter", "dragOver"]) await cdp.send("Input.dispatchDragEvent", { type, x: to.x, y: to.y, data: drag });
    await page.waitForTimeout(500);
    await shot(1500, { step: 3, caption: "Thả chuột vào giữa trang để cài", ghost: to, cursor: { x: to.x + 4, y: to.y + 4 } });
    await cdp.send("Input.dispatchDragEvent", { type: "dragCancel", x: to.x, y: to.y, data: drag }).catch(() => {});
  } else {
    const load = await page.evaluate(findRect, { text: b.loadLabel });
    const lc = center(load);
    await shot(1800, { step: 3, caption: `Bấm ${b.loadLabel}`, ring: load, cursor: { x: lc.x, y: lc.y + 2 }, click: true });
    // Không bấm thật: nút mở hộp chọn thư mục của hệ điều hành (không chụp được) → vẽ minh hoạ.
    await shot(2200, { step: 3, caption: `Chọn thư mục ${FOLDER} → bấm Chọn thư mục`, picker: true, cursor: { x: 840, y: 270 } });
  }
  await page.evaluate(() => document.getElementById("__guide")?.remove());
  // CDP không mang được đường dẫn thật của thao tác thả/chọn → cài bằng Extensions.loadUnpacked (kết quả y như thao tác tay).
  const browserCdp = ctx.browser() ? await ctx.browser().newBrowserCDPSession() : cdp;
  await browserCdp.send("Extensions.loadUnpacked", { path: EXT_DIR });
  await page.reload();
  await page.waitForTimeout(3500); // chờ thẻ tiện ích hiện hẳn (Brave có hiệu ứng mờ dần)
  const card = await page.evaluate(findRect, { tag: "EXTENSIONS-ITEM" }) || await page.evaluate(findRect, { aria: "Địa Bạ - Google Maps Profiler" });
  await shot(2400, { step: 3, caption: "Đã cài: Địa Bạ - Google Maps Profiler", ring: card });

  // 4. Quay lại Địa Bạ (trang thật, extension đã kết nối)
  await page.goto("http://localhost:3000/login");
  await page.waitForTimeout(1200);
  if (page.url().includes("/login")) {
    await page.getByRole("textbox", { name: /Email/ }).fill(LOGIN.user);
    await page.getByRole("textbox", { name: "Mật khẩu" }).fill(LOGIN.pass);
    await page.getByRole("button", { name: /Đăng nhập/ }).click();
    await page.waitForURL("http://localhost:3000/", { timeout: 20000 });
  }
  await page.getByRole("textbox", { name: "Tìm địa điểm" }).pressSequentially(PLACE, { delay: 15 });
  await page.getByRole("option").first().click({ timeout: 15000 });
  const btn = page.getByRole("button", { name: "Thu thập phần còn thiếu từ Google Maps" });
  await btn.waitFor({ timeout: 40000 });
  await btn.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -200));
  await page.waitForTimeout(600);
  const panel = await btn.evaluate((el) => { const r = el.closest("div.rounded-xl").getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  const bb = await btn.boundingBox();
  await shot(3200, { step: 4, caption: "Quay lại Địa Bạ: bấm Đã cài xong, rồi Thu thập phần còn thiếu", ring: panel, cursor: { x: Math.round(bb.x + bb.width / 2), y: Math.round(bb.y + bb.height / 2) } });
  await ctx.close();

  // Ghép GIF: mỗi khung giữ đúng thời lượng; bảng màu tối ưu, thu về rộng 960px.
  const list = path.join(dir, "frames.txt");
  fs.writeFileSync(list, frames.map((f) => `file '${f.file.replace(/\\/g, "/")}'\nduration ${(f.ms / 1000).toFixed(2)}`).join("\n") + `\nfile '${frames[frames.length - 1].file.replace(/\\/g, "/")}'\n`);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const out = path.join(OUT_DIR, `extension-install-${id}.gif`);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list,
    "-vf", "scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4", "-loop", "0", out]);
  console.log(`[guides] ${id}: ${frames.length} khung → ${path.relative(ROOT, out)} (${Math.round(fs.statSync(out).size / 1024)} KB)`);
}

(async () => {
  const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(BROWSERS);
  for (const id of ids) await recordBrowser(id);
  fs.rmSync(WORK, { recursive: true, force: true });
})().catch((e) => { console.error("[guides] lỗi:", e); process.exit(1); });
