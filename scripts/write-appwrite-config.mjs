import { writeFile } from "node:fs/promises";

const config = {
  endpoint: process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT ?? "",
  projectId: process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID ?? "",
  databaseId: process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID ?? "smolensk-art",
  postsTableId: process.env.NEXT_PUBLIC_APPWRITE_POSTS_TABLE_ID ?? "posts",
  mediaTableId:
    process.env.NEXT_PUBLIC_APPWRITE_MEDIA_TABLE_ID ?? "post-media",
};

const source = `window.SMOLENSK_APPWRITE_CONFIG = ${JSON.stringify(config)};\n`;
await writeFile("public/appwrite-config.js", source, "utf8");
