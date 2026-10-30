// Bundle src/jobs/lambda.ts into one ESM file for AWS Lambda (Node 20).
//
//   node ops/scripts/build-jobs.mjs      (from the repo root; writes ops/dist/jobs/index.mjs)
//
// Same bundler as Netlify's functions (esbuild), so a handler that bundles
// and runs there bundles and runs here. `@/` resolves through src/tsconfig.json.
import { build } from "../../src/node_modules/esbuild/lib/main.js";
import path from "node:path";

const root = path.join(import.meta.dirname, "..", "..");

await build({
  absWorkingDir: path.join(root, "src"),
  entryPoints: ["jobs/lambda.ts"],
  outfile: path.join(root, "ops", "dist", "jobs", "index.mjs"),
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  tsconfig: "tsconfig.json",
  // ESM bundles of CommonJS dependencies still call require() for Node builtins.
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  logLevel: "info",
});
