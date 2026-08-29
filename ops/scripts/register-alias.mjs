// Entry point for `node --import ./ops/scripts/register-alias.mjs <script>`.
import { register } from "node:module";
register("./alias-loader.mjs", import.meta.url);
