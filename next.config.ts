import type { NextConfig } from "next";

const isStaticExport = process.env.STATIC_EXPORT === "1";
/* GitHub Pages для репозитория = github.io/<repo>/ — без basePath все ссылки на /_next/* бьют в корень домена и ломаются */
const pagesBasePath =
  isStaticExport && process.env.PAGES_BASE_PATH
    ? process.env.PAGES_BASE_PATH.startsWith("/")
      ? process.env.PAGES_BASE_PATH
      : `/${process.env.PAGES_BASE_PATH}`
    : "";

const nextConfig: NextConfig = {
  ...(pagesBasePath ? { basePath: pagesBasePath } : {}),
  output: isStaticExport ? "export" : "standalone",
  ...(isStaticExport && {
    images: { unoptimized: true },
  }),
};

export default nextConfig;
