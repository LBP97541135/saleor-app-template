#!/usr/bin/env node
/**
 * Verification script for the requirement:
 *   - src/pages/api/promotions/ directory with preview.ts API route
 *   - POST {rules, cart} -> uses saleor-sdk parseRule + evaluate (no re-implemented evaluation)
 *   - returns DiscountEvaluation, 400 on invalid params, 500 on evaluate throw
 *   - reuses saleor-sdk types so field names match
 *   - API tests covering happy path, missing params, type errors, exceptions
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const repo = process.cwd();
const ROUTE_DIR = "src/pages/api/promotions";
const ROUTE_FILE = "src/pages/api/promotions/preview.ts";

const checks = [];
function check(id, description, fn) {
  let ok = false;
  let detail = "";
  try {
    const r = fn();
    if (typeof r === "object" && r !== null) {
      ok = !!r.ok;
      detail = r.detail ?? "";
    } else {
      ok = !!r;
    }
  } catch (e) {
    ok = false;
    detail = `error: ${e.message}`;
  }
  checks.push({ id, description, ok, detail });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${id} - ${description}${detail ? ` :: ${detail}` : ""}`);
  return ok;
}

function listRouteFiles() {
  const abs = path.join(repo, ROUTE_DIR);
  if (!existsSync(abs) || !statSync(abs).isDirectory()) return [];
  return readdirSync(abs, { recursive: true })
    .map((f) => String(f))
    .filter((f) => /\.(ts|tsx)$/.test(f))
    .sort();
}

const routeFiles = listRouteFiles();
const routeSource = existsSync(path.join(repo, ROUTE_FILE))
  ? readFileSync(path.join(repo, ROUTE_FILE), "utf8")
  : null;

check("AC1.dir", `${ROUTE_DIR}/ exists`, () => {
  const abs = path.join(repo, ROUTE_DIR);
  const exists = existsSync(abs) && statSync(abs).isDirectory();
  return { ok: exists, detail: exists ? "" : "directory not found" };
});

check("AC2.file", `${ROUTE_FILE} exists`, () => ({
  ok: routeSource !== null,
  detail: routeSource === null ? "file not found" : `${routeSource.split("\n").length} lines`,
}));

check("AC2.post-handler", "default-exported handler guards for POST", () => {
  if (routeSource === null) return { ok: false, detail: "route file missing" };
  const hasDefault = /export\s+default/.test(routeSource);
  const hasPost = /(req|request)\.method\s*(?:!==|===|==|!=)\s*["']POST["']/i.test(routeSource) ||
    /["']POST["']\s*(?:!==|===|==|!=)\s*(req|request)\.method/i.test(routeSource);
  return { ok: hasDefault && hasPost, detail: `defaultExport=${hasDefault} postGuard=${hasPost}` };
});

check("AC2.body-shape", "body contract uses { rules, cart }", () => {
  if (routeSource === null) return { ok: false, detail: "route file missing" };
  const hasRules = /\brules\b/.test(routeSource);
  const hasCart = /\bcart\b/.test(routeSource);
  return { ok: hasRules && hasCart, detail: `rules=${hasRules} cart=${hasCart}` };
});

check("AC2.sdk-functions", "imports parseRule and evaluate from saleor-sdk", () => {
  if (routeSource === null) return { ok: false, detail: "route file missing" };
  const importBlocks = routeSource.match(/import[\s\S]*?from\s*["'][^"']+["']/g) ?? [];
  const sdkImport = importBlocks.find((b) => /saleor-sdk|@saleor\/sdk/.test(b));
  const usesParseRule = /parseRule/.test(routeSource);
  const usesEvaluate = /\bevaluate\b/.test(routeSource);
  return {
    ok: Boolean(sdkImport) && usesParseRule && usesEvaluate,
    detail: `sdkImport=${Boolean(sdkImport)} parseRule=${usesParseRule} evaluate=${usesEvaluate}`,
  };
});

check("AC2.no-reimplemented-evaluation", "no hand-rolled evaluation logic", () => {
  if (routeSource === null) return { ok: false, detail: "route file missing" };
  const importsParseRule = /parseRule/.test(routeSource);
  const inlineMath = /(?:reduce|filter)\s*\([^)]*(?:discount|percentage|total|amount)/i.test(routeSource);
  return { ok: importsParseRule && !inlineMath, detail: `importsParseRule=${importsParseRule} inlineMath=${inlineMath}` };
});

check("AC2.returns-discount-evaluation", "returns DiscountEvaluation type", () => {
  if (routeSource === null) return { ok: false, detail: "route file missing" };
  const mentioned = /DiscountEvaluation/.test(routeSource);
  return { ok: mentioned, detail: mentioned ? "" : "DiscountEvaluation not referenced" };
});

check("AC2.error-handling", "400 for invalid params and 500 for evaluate failure", () => {
  if (routeSource === null) return { ok: false, detail: "route file missing" };
  const s400 = /(?:status(?:Code)?\s*=\s*400|\.status\(400\))/.test(routeSource);
  const s500 = /(?:status(?:Code)?\s*=\s*500|\.status\(500\))/.test(routeSource);
  return { ok: s400 && s500, detail: `400=${s400} 500=${s500}` };
});

check("AC3.reuses-sdk-types", "reuses saleor-sdk type definitions", () => {
  if (routeSource === null) return { ok: false, detail: "route file missing" };
  const typeImport = /import\s+type[\s\S]*?from\s*["'][^"']*(?:saleor-sdk|@saleor\/sdk)["']/.test(routeSource);
  return { ok: typeImport, detail: `typeImport=${typeImport}` };
});

const testFiles = routeFiles.filter((f) => /\.(test|spec)\.tsx?$/.test(f));
check("AC4.tests-exist", `${ROUTE_DIR}/ has API test files`, () => {
  if (!existsSync(path.join(repo, ROUTE_DIR))) return { ok: false, detail: "directory missing" };
  return { ok: testFiles.length > 0, detail: testFiles.join(", ") || "no *.test.ts(x)/*.spec.ts(x) found" };
});

check("AC4.tests-scenarios", "tests cover happy path, missing params, type errors, exceptions", () => {
  if (testFiles.length === 0) return { ok: false, detail: "no test files to inspect" };
  const src = testFiles.map((f) => readFileSync(path.join(repo, ROUTE_DIR, f), "utf8")).join("\n");
  const happy = /(200|ok|success|valid\s+request)/i.test(src);
  const missing = /(missing|required|400|undefined|without)/i.test(src);
  const typeErr = /(type|typeof|invalid|string|number)/i.test(src);
  const exception = /(throw|reject|500|error)/i.test(src);
  return { ok: happy && missing && typeErr && exception, detail: `happy=${happy} missing=${missing} typeErr=${typeErr} exception=${exception}` };
});

// Executable evidence: run the task-scoped API tests when they exist.
let testRun = { ran: false, command: null, exitCode: null, output: "" };
if (testFiles.length > 0) {
  const command = `pnpm vitest run ${ROUTE_DIR}`;
  const r = spawnSync(command, { shell: true, cwd: repo, encoding: "utf8" });
  testRun = { ran: true, command, exitCode: r.status, output: `${r.stdout ?? ""}${r.stderr ?? ""}`.trim() };
  console.log(`\n--- ${command} (exit ${r.status}) ---\n${testRun.output.split("\n").slice(-25).join("\n")}`);
} else {
  console.log(`\n--- task-scoped tests NOT run: no test files under ${ROUTE_DIR} ---`);
}

const failed = checks.filter((c) => !c.ok);
console.log("\n==================== SUMMARY ====================");
console.log(`checks: ${checks.length}, passed: ${checks.length - failed.length}, failed: ${failed.length}`);
console.log(`failed checks: ${failed.map((c) => c.id).join(", ") || "(none)"}`);
console.log(`route files present: ${routeFiles.join(", ") || "(none)"}`);
console.log(`task-scoped test run: ${testRun.ran ? `exit ${testRun.exitCode}` : "not run"}`);

const passed = failed.length === 0 && testRun.ran && testRun.exitCode === 0;
console.log(`RESULT: ${passed ? "PASS" : "FAIL"}`);
process.exit(passed ? 0 : 1);
