/**
 * Dựng trang báo cáo in được (A4) cho bản thẩm định AI.
 * Người dùng bấm "In / Lưu PDF" trong cửa sổ xem trước → chọn "Save as PDF".
 * Markdown được chuyển sang HTML với đúng các cú pháp mà MarkdownLite hỗ trợ:
 * heading ##–####, kẻ ngang, gạch đầu dòng, danh sách số, **đậm**, *nhấn*, `mã`.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** *nhấn* và `mã` trong một đoạn đã escape */
function inlineLight(text: string): string {
  return text
    .split(/(`[^`]+`|\*[^*\n]+\*)/g)
    .map((tok) => {
      if (/^`[^`]+`$/.test(tok)) return `<code>${tok.slice(1, -1)}</code>`;
      if (/^\*[^*\n]+\*$/.test(tok)) return `<em>${tok.slice(1, -1)}</em>`;
      return tok;
    })
    .join("");
}

function inlineMd(text: string): string {
  return text
    .split(/\*\*(.+?)\*\*/g)
    .map((part, i) => (i % 2 === 1 ? `<strong>${inlineLight(part)}</strong>` : inlineLight(part)))
    .join("");
}

interface MdListItem {
  text: string;
  subs: string[];
}

function markdownToHtml(md: string): string {
  const out: string[] = [];
  let list: { ordered: boolean; start: number; items: MdListItem[] } | null = null;

  const renderItem = (it: MdListItem) =>
    `<li>${inlineMd(it.text)}${
      it.subs.length ? `<ul>` + it.subs.map((s) => `<li>${inlineMd(s)}</li>`).join("") + `</ul>` : ""
    }</li>`;

  const flushList = () => {
    if (!list) return;
    const body = list.items.map(renderItem).join("");
    out.push(
      list.ordered ? `<ol start="${list.start}">${body}</ol>` : `<ul>${body}</ul>`
    );
    list = null;
  };

  for (const rawLine of md.split("\n")) {
    const line = escapeHtml(rawLine.trim());
    if (!line) {
      // dòng trống không ngắt danh sách số — Gemini hay chèn dòng trống giữa các mục
      if (!list?.ordered) flushList();
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
      flushList();
      continue;
    }
    const heading = line.match(/^(#{2,4})\s+(.*)$/);
    if (heading) {
      flushList();
      out.push(`<h2>${inlineMd(heading[2].replace(/\*\*/g, ""))}</h2>`);
      continue;
    }
    const bullet = line.match(/^[-*]\s+(.*)$/);
    if (bullet) {
      // bullet ngay sau mục số = ý con của mục đó
      if (list?.ordered && list.items.length > 0) {
        list.items[list.items.length - 1].subs.push(bullet[1]);
      } else {
        if (!list) list = { ordered: false, start: 1, items: [] };
        list.items.push({ text: bullet[1], subs: [] });
      }
      continue;
    }
    const numbered = line.match(/^(\d+)[.)]\s+(.*)$/);
    if (numbered) {
      if (!list || !list.ordered) {
        flushList();
        list = { ordered: true, start: parseInt(numbered[1], 10) || 1, items: [] };
      }
      list.items.push({ text: numbered[2], subs: [] });
      continue;
    }
    flushList();
    out.push(`<p>${inlineMd(line)}</p>`);
  }
  flushList();
  return out.join("\n");
}

export interface AuditReportInput {
  restaurant: string;
  analysis: string;
  /** ví dụ "8.5" — hiển thị ở góc header nếu có */
  score?: string | null;
  logoUrl: string;
}

export function buildAuditReportHtml({ restaurant, analysis, score, logoUrl }: AuditReportInput): string {
  const date = new Date().toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const safeName = escapeHtml(restaurant);

  return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>GoDine Audit — ${safeName}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&family=Be+Vietnam+Pro:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" />
<style>
  :root {
    --orange: #f1660a;
    --orange-deep: #c14e03;
    --ink: #21272e;
    --soft: #6b7280;
    --line: #e5e7eb;
    --chip: #f3f4f6;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    font-family: "Be Vietnam Pro", system-ui, sans-serif;
    color: var(--ink);
    background: #f0f1f3;
    font-size: 10.5pt;
    line-height: 1.62;
  }

  /* Thanh công cụ — không in */
  .toolbar {
    position: sticky; top: 0; z-index: 10;
    display: flex; align-items: center; justify-content: center; gap: 14px;
    padding: 10px;
    background: #ffffffeb; backdrop-filter: blur(6px);
    border-bottom: 1px solid var(--line);
  }
  .toolbar button {
    font: 600 10.5pt "Be Vietnam Pro", sans-serif;
    color: #fff; background: var(--orange);
    border: 0; border-radius: 8px; padding: 9px 20px; cursor: pointer;
  }
  .toolbar button:hover { background: var(--orange-deep); }
  .toolbar span { font: 400 8.5pt "IBM Plex Mono", monospace; color: var(--soft); }

  .sheet {
    max-width: 186mm; margin: 8mm auto 16mm; background: #fff;
    padding: 16mm 15mm; box-shadow: 0 2px 24px rgba(0,0,0,.08);
  }

  /* Header thương hiệu */
  .head { display: flex; gap: 8mm; align-items: flex-start; }
  .head img { width: 25mm; height: 25mm; object-fit: contain; flex-shrink: 0; }
  .head .eyebrow {
    font: 500 7.5pt "IBM Plex Mono", monospace; letter-spacing: .22em;
    text-transform: uppercase; color: var(--orange);
  }
  .head h1 {
    font-family: "Archivo", sans-serif; font-weight: 800; font-stretch: 116%;
    font-size: 17.5pt; line-height: 1.2; margin: 2mm 0 3mm;
  }
  .head .meta { font-size: 9.5pt; color: var(--ink); }
  .head .meta div { margin-top: .8mm; }
  .head .meta .label { color: var(--soft); }
  .score-pill {
    margin-left: auto; flex-shrink: 0; text-align: center;
    border: 1.5pt solid var(--orange); border-radius: 10px; padding: 3mm 4.5mm;
  }
  .score-pill .num {
    font-family: "Archivo", sans-serif; font-weight: 800; font-stretch: 116%;
    font-size: 19pt; color: var(--orange-deep); line-height: 1;
  }
  .score-pill .cap { font: 500 6.5pt "IBM Plex Mono", monospace; letter-spacing: .12em; text-transform: uppercase; color: var(--soft); margin-top: 1.5mm; }

  .rule { height: 1.2mm; background: var(--orange); border: 0; margin: 6mm 0 7mm; }

  /* Nội dung báo cáo */
  .report h2 {
    font-family: "Archivo", sans-serif; font-weight: 700; font-stretch: 116%;
    font-size: 10.5pt; text-transform: uppercase; letter-spacing: .1em;
    color: var(--orange-deep); margin: 6mm 0 2.5mm;
    display: flex; align-items: center; gap: 2.2mm;
    break-after: avoid-page;
  }
  .report h2::before {
    content: ""; width: 2.4mm; height: 2.4mm; background: var(--orange);
    transform: rotate(45deg); flex-shrink: 0;
  }
  .report p { margin: 2mm 0; }
  .report ul, .report ol { margin: 2mm 0 3mm; padding-left: 6mm; }
  .report li { margin: 1.4mm 0; break-inside: avoid-page; }
  .report li > ul { margin: 1mm 0 1.5mm; padding-left: 5mm; }
  .report li > ul li { margin: 1mm 0; }
  .report ul li::marker { color: var(--orange); }
  .report ol li::marker { font-family: "IBM Plex Mono", monospace; font-weight: 500; color: var(--orange-deep); }
  .report strong { font-weight: 600; }
  .report code {
    font: 500 .85em "IBM Plex Mono", monospace;
    background: var(--chip); border-radius: 3px; padding: .5pt 3pt;
  }

  .foot {
    margin-top: 9mm; padding-top: 3.5mm; border-top: .4pt solid var(--line);
    display: flex; justify-content: space-between; gap: 6mm;
    font: 400 7.5pt "IBM Plex Mono", monospace; color: var(--soft);
  }

  /* Khung bảng chỉ dùng khi in: thead/tfoot lặp lại mỗi trang tạo lề trên/dưới.
     Nhờ đó @page margin = 0 → Chrome không còn chỗ in header/footer mặc định
     (dòng tiêu đề + URL trên lề giấy). Trên màn hình khung này vô hình. */
  .frame { width: 100%; border-collapse: collapse; }
  .frame, .frame > thead, .frame > tbody, .frame > tfoot, .frame tr, .frame td { display: block; }
  .frame > thead, .frame > tfoot { display: none; }

  @page { size: A4; margin: 0; }
  @media print {
    body { background: #fff; }
    .toolbar { display: none; }
    .frame { display: table; }
    .frame > thead { display: table-header-group; }
    .frame > tbody { display: table-row-group; }
    .frame > tfoot { display: table-footer-group; }
    .frame tr { display: table-row; }
    .frame td { display: table-cell; }
    .frame-space { height: 10mm; }
    .sheet { max-width: none; margin: 0; padding: 0 13mm; box-shadow: none; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <button onclick="window.print()">In / Lưu PDF</button>
    <span>chọn “Save as PDF” trong hộp thoại in</span>
  </div>

  <table class="frame">
  <thead><tr><td class="frame-space" aria-hidden="true"></td></tr></thead>
  <tfoot><tr><td class="frame-space" aria-hidden="true"></td></tr></tfoot>
  <tbody><tr><td>
  <main class="sheet">
    <header class="head">
      <img src="${logoUrl}" alt="GoDine" />
      <div>
        <p class="eyebrow">GoDine · Business Profile Audit</p>
        <h1>Google Business Profile<br />Audit Report</h1>
        <div class="meta">
          <div><span class="label">Nhà hàng:</span> <strong>${safeName}</strong></div>
          <div><span class="label">Được thực hiện bởi:</span> <strong>GoDine</strong>: Giải pháp “Đặt bàn” qua Google Maps</div>
          <div><span class="label">Ngày lập:</span> ${date}</div>
        </div>
      </div>
      ${
        score
          ? `<div class="score-pill"><div class="num">${escapeHtml(score)}<span style="font-size:9pt">/10</span></div><div class="cap">cạnh tranh</div></div>`
          : ""
      }
    </header>

    <hr class="rule" />

    <article class="report">
${markdownToHtml(analysis)}
    </article>

    <footer class="foot">
      <span>GoDine — Giải pháp “Đặt bàn” qua Google Maps</span>
      <span>Báo cáo lập ngày ${date}</span>
    </footer>
  </main>
</body>
</html>`;
}

/** Mở cửa sổ xem trước báo cáo; trả về false nếu popup bị chặn */
export function openAuditReport(input: AuditReportInput): boolean {
  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.write(buildAuditReportHtml(input));
  win.document.close();
  return true;
}
