import { register } from "node:module";
register("./alias-loader.mjs", import.meta.url);
// Next's bundler accepts this extensionless subpath; Node's ESM resolver
// needs the file extension before mock.module() can substitute the adapter.
register("data:text/javascript," + encodeURIComponent(`
  export function resolve(specifier, context, next) {
    return next(specifier === "next/server" ? "next/server.js" : specifier, context);
  }
`), import.meta.url);
