import { mkdir, rm } from "node:fs/promises";

import { build } from "esbuild";

const outputDirectory = "dist/auth-email-feedback-worker";
await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
const result = await build({
  entryPoints: ["scripts/start-auth-email-feedback-worker.ts"],
  outfile: `${outputDirectory}/worker.mjs`,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  sourcemap: false,
  minify: true,
  legalComments: "none",
  banner: {
    js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);',
  },
  metafile: true,
  external: ["pg-native"],
  plugins: [
    {
      name: "server-only-marker",
      setup(buildContext) {
        buildContext.onResolve({ filter: /^server-only$/ }, () => ({
          path: "server-only",
          namespace: "server-only-marker",
        }));
        buildContext.onLoad(
          { filter: /.*/, namespace: "server-only-marker" },
          () => ({ contents: "export {};", loader: "js" }),
        );
      },
    },
  ],
});
const output = Object.values(result.metafile.outputs)[0];
if (!output || output.bytes > 5 * 1024 * 1024)
  throw new Error("feedback worker bundle exceeds the 5 MiB budget");
console.log(`feedback worker bundle valid (${output.bytes} bytes)`);
