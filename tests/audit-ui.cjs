const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (name, ...args) {
  return originalResolve.call(this, name.startsWith("@/") ? path.join(root, "src", name.slice(2)) : name, ...args);
};
for (const extension of [".ts", ".tsx"]) {
  require.extensions[extension] = (module, filename) => {
    const { outputText } = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
      fileName: filename,
    });
    module._compile(outputText, filename);
  };
}
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { AiAuditSection } = require("../src/components/sections.tsx");
const render = state => renderToStaticMarkup(React.createElement(AiAuditSection, {
  state, restaurant: "Quán thử nghiệm", onRun() {},
}));
const failed = render({ status: "error", message: "Báo cáo thiếu điểm hợp lệ.", analysis: "Nội dung đã nhận của nhà hàng." });
assert.ok(failed.includes("Nội dung đã nhận của nhà hàng."));
assert.ok(failed.includes("Báo cáo thiếu điểm hợp lệ."));
assert.ok(!failed.includes("Xuất PDF"));
assert.ok(!failed.includes("/10 cạnh tranh"));
const complete = render({ status: "done", analysis: "## Điểm cạnh tranh: 0/10" });
assert.ok(complete.includes("Xuất PDF"));
assert.ok(complete.includes("/10 cạnh tranh"));
assert.ok(!complete.includes("Chưa hoàn tất thẩm định"));
const streaming = render({ status: "streaming", analysis: "Báo cáo đang được nhận." });
assert.ok(streaming.includes("Báo cáo đang được nhận."));
assert.ok(!streaming.includes("Xuất PDF"));
console.log("PASS: lỗi giữ nội dung và chặn xuất PDF; điểm 0 hợp lệ; đang nhận chưa được xuất PDF.");
