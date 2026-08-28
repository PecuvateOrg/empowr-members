// Module resolver hook so plain `node` can run app code from src/.
//
// Next.js resolves the "@/*" tsconfig alias and extensionless imports; bare
// node does neither, which is why nothing under src/lib/emails/ has ever been
// runnable (or testable) outside a Next build. Node 24 strips TS types by
// itself, so this hook is the only missing piece.
//
// Used by render-auth-templates.ts, and available to any future node --test
// suite that needs a module with runtime "@/" imports.
import { fileURLToPath, pathToFileURL } from "node:url";
import { statSync } from "node:fs";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, "../../src");

// Order matters: an exact file wins over a directory index.
const CANDIDATES = ["", ".ts", ".tsx", ".mjs", ".js", "/index.ts", "/index.tsx"];

function resolveFile(base) {
  for (const ext of CANDIDATES) {
    const p = base + ext;
    try {
      if (statSync(p).isFile()) return p;
    } catch {
      /* not this one */
    }
  }
  return null;
}

export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    const found = resolveFile(path.join(SRC, specifier.slice(2)));
    if (found) return { url: pathToFileURL(found).href, shortCircuit: true };
  }
  if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
    const from = path.dirname(fileURLToPath(context.parentURL));
    const found = resolveFile(path.resolve(from, specifier));
    if (found) return { url: pathToFileURL(found).href, shortCircuit: true };
  }
  return next(specifier, context);
}
