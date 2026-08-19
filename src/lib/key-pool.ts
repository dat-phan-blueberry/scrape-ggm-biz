/**
 * Xoay vòng nhiều API key cho một nhà cung cấp.
 *
 * Luật (chú chốt phiên 2026-08-19):
 *  - Nhiều key nằm trong một hàng đợi. Luôn dùng key ở ĐẦU hàng đợi cho tới khi
 *    nó chết, chứ không rải đều — free tier tính theo tổng lượt nên dùng cạn
 *    từng key dễ đoán hơn là để cả bốn key cùng lấp lửng.
 *  - Key báo hết hạn mức bị đánh dấu "đang nghỉ" và **ném xuống cuối hàng đợi**.
 *  - Hết thời gian nghỉ (mặc định 24h) thì key tự sống lại, không cần can thiệp.
 *  - Trạng thái nghỉ được ghi ra đĩa để một lần restart không xoá sạch cooldown
 *    rồi bắn lại loạt request vào những key đã cạn. Ghi bằng **dấu tay băm**
 *    của key, không bao giờ ghi chính key ra file.
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const MINUTE_MS = 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;

/** Lý do một key bị cho nghỉ. Quyết định độ dài cooldown; soi được ở /api/key-status. */
export type PenaltyReason = "quota" | "rate" | "invalid";

export interface KeyLease {
  /** Key thật — chỉ để gắn vào request. KHÔNG log, KHÔNG trả ra response. */
  readonly key: string;
  /** Nhãn an toàn để log: thứ tự trong .env + 4 ký tự cuối. */
  readonly label: string;
  /** Chỉ số nội bộ, dùng khi báo lại kết quả cho pool. */
  readonly slot: number;
}

interface Slot {
  key: string;
  label: string;
  fingerprint: string;
  /** Epoch ms; <= now nghĩa là dùng được. */
  cooldownUntil: number;
  reason: PenaltyReason | null;
  successes: number;
  penalties: number;
}

export interface PoolSnapshot {
  provider: string;
  total: number;
  ready: number;
  keys: Array<{
    label: string;
    state: "ready" | "cooling";
    reason: PenaltyReason | null;
    readyAt: string | null;
    successes: number;
    penalties: number;
  }>;
  nextAvailableAt: string | null;
}

/**
 * Giá trị placeholder phải bị coi như CHƯA cấu hình, không được gửi lên nguồn.
 * Cùng luật với `D-0019` (venues-web/customer-web) cho nhất quán toàn workspace.
 */
function isPlaceholder(value: string): boolean {
  const v = value.trim();
  if (v.length < 20) return true;
  const lower = v.toLowerCase();
  return (
    lower === "[sensitive]" ||
    lower.startsWith("your_") ||
    lower.startsWith("your-") ||
    lower === "changeme" ||
    lower.includes("...")
  );
}

/**
 * Đọc danh sách key từ env. Chấp nhận cả hai cách khai để chú khỏi phải nhớ:
 *   SERPAPI_KEY=k1,k2,k3,k4          (một biến; phẩy / xuống dòng / space đều được)
 *   SERPAPI_KEY_1=k1 … SERPAPI_KEY_4=k4
 * Cách một biến vẫn tương thích với file .env cũ chỉ có đúng một key.
 */
function readKeysFromEnv(baseName: string, maxNumbered = 20): string[] {
  const raw: string[] = [];
  const push = (value: string | undefined) => {
    if (!value) return;
    for (const part of value.split(/[,;\s]+/)) {
      const key = part.trim();
      if (key) raw.push(key);
    }
  };

  push(process.env[baseName]);
  push(process.env[`${baseName}S`]);
  for (let i = 1; i <= maxNumbered; i++) push(process.env[`${baseName}_${i}`]);

  const seen = new Set<string>();
  const keys: string[] = [];
  for (const key of raw) {
    if (isPlaceholder(key) || seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
  }
  return keys;
}

function fingerprintOf(key: string): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 16);
}

export class KeyPool {
  private slots: Slot[];
  /** Hàng đợi: mảng chỉ số slot; phần tử đầu là key đang được ưu tiên dùng. */
  private queue: number[];
  private readonly statePath: string;
  private persistBroken = false;

  constructor(
    readonly provider: string,
    keys: string[],
    private readonly cooldownMs: Record<PenaltyReason, number> = {
      quota: DAY_MS,
      rate: MINUTE_MS,
      invalid: DAY_MS,
    },
  ) {
    this.slots = keys.map((key, i) => ({
      key,
      label: `#${i + 1}…${key.slice(-4)}`,
      fingerprint: fingerprintOf(key),
      cooldownUntil: 0,
      reason: null,
      successes: 0,
      penalties: 0,
    }));
    this.queue = this.slots.map((_, i) => i);
    // Mỗi provider một file riêng. Dùng chung một file thì pool nạp sau sẽ ghi
    // đè cooldown của pool nạp trước — im lặng, và chỉ lộ ra sau một lần restart.
    this.statePath = path.join(
      process.cwd(),
      `.key-pool-state.${provider.replace(/[^a-z0-9._-]/gi, "_")}.json`,
    );
    this.restore();
  }

  get size(): number {
    return this.slots.length;
  }

  /**
   * Lấy key dùng được đầu hàng đợi. Key đang nghỉ bị bỏ qua nhưng KHÔNG bị đổi
   * chỗ — nó giữ nguyên vị trí và tự quay lại lượt khi hết cooldown.
   * Trả `null` khi cả pool đang nghỉ.
   */
  acquire(): KeyLease | null {
    const now = Date.now();
    for (const slot of this.queue) {
      const s = this.slots[slot];
      if (s.cooldownUntil <= now) {
        if (s.reason !== null) {
          console.info(
            `[key-pool:${this.provider}] key ${s.label} hết thời gian nghỉ (${s.reason}), dùng lại`,
          );
          s.reason = null;
          this.persist();
        }
        return { key: s.key, label: s.label, slot };
      }
    }
    return null;
  }

  reportSuccess(lease: KeyLease): void {
    this.slots[lease.slot].successes++;
  }

  /** Cho key nghỉ và ném nó xuống cuối hàng đợi. */
  penalize(lease: KeyLease, reason: PenaltyReason): void {
    const s = this.slots[lease.slot];
    s.cooldownUntil = Date.now() + this.cooldownMs[reason];
    s.reason = reason;
    s.penalties++;

    const at = this.queue.indexOf(lease.slot);
    if (at !== -1) {
      this.queue.splice(at, 1);
      this.queue.push(lease.slot);
    }

    console.warn(
      `[key-pool:${this.provider}] key ${s.label} bị cho nghỉ (${reason}) tới ${new Date(
        s.cooldownUntil,
      ).toISOString()}; còn ${this.readyCount()}/${this.size} key dùng được`,
    );
    this.persist();
  }

  readyCount(): number {
    const now = Date.now();
    return this.slots.filter((s) => s.cooldownUntil <= now).length;
  }

  /** Thời điểm sớm nhất có key sống lại — để nói cho người dùng biết chờ tới lúc nào. */
  nextAvailableAt(): Date | null {
    if (this.slots.length === 0) return null;
    const soonest = Math.min(...this.slots.map((s) => s.cooldownUntil));
    return soonest <= Date.now() ? new Date() : new Date(soonest);
  }

  snapshot(): PoolSnapshot {
    const now = Date.now();
    const next = this.nextAvailableAt();
    return {
      provider: this.provider,
      total: this.size,
      ready: this.readyCount(),
      keys: this.queue.map((slot) => {
        const s = this.slots[slot];
        const cooling = s.cooldownUntil > now;
        return {
          label: s.label,
          state: cooling ? ("cooling" as const) : ("ready" as const),
          reason: cooling ? s.reason : null,
          readyAt: cooling ? new Date(s.cooldownUntil).toISOString() : null,
          successes: s.successes,
          penalties: s.penalties,
        };
      }),
      nextAvailableAt: this.readyCount() > 0 ? null : (next?.toISOString() ?? null),
    };
  }

  // — lưu / khôi phục cooldown qua các lần restart ————————————————————

  private persist(): void {
    if (this.persistBroken) return;
    try {
      const payload = {
        version: 1,
        provider: this.provider,
        cooldowns: this.slots
          .filter((s) => s.cooldownUntil > Date.now())
          .map((s) => ({ fingerprint: s.fingerprint, until: s.cooldownUntil, reason: s.reason })),
      };
      writeFileSync(this.statePath, JSON.stringify(payload, null, 2), "utf8");
    } catch {
      // Filesystem chỉ-đọc (serverless) — chạy tiếp bằng state trong RAM.
      // Báo một lần rồi thôi, đừng làm bẩn log mỗi request.
      this.persistBroken = true;
      console.info(
        `[key-pool:${this.provider}] không ghi được ${path.basename(
          this.statePath,
        )}; cooldown chỉ giữ trong RAM`,
      );
    }
  }

  private restore(): void {
    let parsed: any;
    try {
      parsed = JSON.parse(readFileSync(this.statePath, "utf8"));
    } catch {
      return; // chưa có file, hoặc file rác — coi như mọi key đều tươi
    }
    if (parsed?.provider !== this.provider || !Array.isArray(parsed.cooldowns)) return;

    const now = Date.now();
    for (const entry of parsed.cooldowns) {
      const s = this.slots.find((x) => x.fingerprint === entry?.fingerprint);
      if (!s) continue; // key đã bị bỏ khỏi .env
      const until = Number(entry.until);
      // Chặn giá trị vô lý (file bị sửa tay) — cooldown không bao giờ dài hơn 24h.
      if (!Number.isFinite(until) || until <= now || until > now + DAY_MS) continue;
      s.cooldownUntil = until;
      s.reason = (entry.reason as PenaltyReason) ?? "quota";
    }

    // Key đang nghỉ phải nằm cuối hàng đợi, đúng như lúc bị phạt.
    this.queue.sort((a, b) => this.slots[a].cooldownUntil - this.slots[b].cooldownUntil);

    const cooling = this.size - this.readyCount();
    if (cooling > 0) {
      console.info(
        `[key-pool:${this.provider}] khôi phục cooldown: ${cooling}/${this.size} key vẫn đang nghỉ`,
      );
    }
  }
}

/**
 * Một instance duy nhất cho cả process. Gắn vào `globalThis` vì hot-reload của
 * `next dev` nạp lại module và sẽ làm mất cooldown nếu giữ ở module scope.
 */
const REGISTRY_KEY = "__diaBaKeyPools__";

function registry(): Map<string, KeyPool> {
  const g = globalThis as any;
  if (!g[REGISTRY_KEY]) g[REGISTRY_KEY] = new Map<string, KeyPool>();
  return g[REGISTRY_KEY];
}

export function getKeyPool(provider: string, envBaseName: string): KeyPool {
  const pools = registry();
  const existing = pools.get(provider);
  if (existing) return existing;

  const keys = readKeysFromEnv(envBaseName);
  const pool = new KeyPool(provider, keys);
  console.info(
    `[key-pool:${provider}] nạp ${keys.length} key từ ${envBaseName} / ${envBaseName}_1..N`,
  );
  pools.set(provider, pool);
  return pool;
}

export function getSerpApiKeyPool(): KeyPool {
  return getKeyPool("serpapi", "SERPAPI_KEY");
}
