import { defineConfig } from "astro/config";
export default defineConfig({
  site: process.env.SITE_URL || "https://status.hostivo.de",
  base: process.env.BASE_PATH || "/",
  output: "static",
  compressHTML: true,
  devToolbar: { enabled: false },
});
