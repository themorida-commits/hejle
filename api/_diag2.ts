// TEMPORARY DIAGNOSTIC EDGE FUNCTION - remove after debugging
// Uses dynamic import so each module failure is caught and reported individually.
export default async function handler(req: any, res: any) {
  const out: Record<string, unknown> = {
    fileLoaded: true,
    nodeVersion: process.version,
    cwd: process.cwd(),
  };

  const modules: Array<[string, () => Promise<unknown>]> = [
    ["express", () => import("express")],
    ["path", () => import("path")],
    ["fs", () => import("fs")],
    ["@google/genai", () => import("@google/genai" as string)],
    ["../services/schedulerSolver", () => import("../services/schedulerSolver.ts" as string)],
    ["../constants", () => import("../constants.ts" as string)],
    ["../utils", () => import("../utils.ts" as string)],
  ];

  const results: Record<string, string> = {};
  for (const [name, load] of modules) {
    try {
      const m: any = await load();
      const keys = m && typeof m === "object" ? Object.keys(m).slice(0, 8).join(",") : typeof m;
      results[name] = "OK -> " + keys;
    } catch (e: any) {
      results[name] = "FAILED -> " + String(e?.message || e).slice(0, 160);
    }
  }
  out.importResults = results;

  res.setHeader("Content-Type", "application/json");
  res.status(200).end(JSON.stringify(out, null, 1));
}
