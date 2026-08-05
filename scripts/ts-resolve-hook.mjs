/**
 * Lets plain `node` run the TypeScript in lib/ without changing how that
 * code is written.
 *
 * The app's source uses bundler-style extensionless relative imports
 * ("./resume-paper"), which is correct for Next and consistent across the
 * codebase. Node's own ESM resolver requires an explicit extension. Rather
 * than litter production source with ".ts" suffixes to suit a test runner,
 * this hook fills in the extension at resolve time — the workaround lives
 * with the test, not in the app.
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith(".") && !/\.[a-z]+$/i.test(specifier)) {
    for (const ext of [".ts", ".tsx", ".mts"]) {
      try {
        const url = new URL(specifier + ext, context.parentURL);
        if (existsSync(fileURLToPath(url))) {
          return nextResolve(specifier + ext, context);
        }
      } catch {
        /* not resolvable as a file URL — fall through to the default */
      }
    }
  }
  return nextResolve(specifier, context);
}
