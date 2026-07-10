import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import {
  Client,
  ID,
  Permission,
  Role,
  Storage,
  TablesDB,
} from "node-appwrite";
import { InputFile } from "node-appwrite/file";

for (const variable of [
  "APPWRITE_ENDPOINT",
  "APPWRITE_PROJECT_ID",
  "APPWRITE_API_KEY",
  "APPWRITE_MIGRATION_AUTHOR_ID",
]) {
  if (!process.env[variable]) {
    throw new Error(`Не задана переменная ${variable}`);
  }
}

const endpoint = process.env.APPWRITE_ENDPOINT;
const projectId = process.env.APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;
const authorId = process.env.APPWRITE_MIGRATION_AUTHOR_ID;
const authorName = process.env.APPWRITE_MIGRATION_AUTHOR_NAME ?? "Смоленск Арт";
const databaseId = process.env.APPWRITE_DATABASE_ID ?? "smolensk-art";
const postsTableId = process.env.APPWRITE_POSTS_TABLE_ID ?? "posts";
const mediaTableId = process.env.APPWRITE_MEDIA_TABLE_ID ?? "post-media";
const bucketId = process.env.APPWRITE_BUCKET_ID ?? "post-media";

const client = new Client()
  .setEndpoint(endpoint)
  .setProject(projectId)
  .setKey(apiKey);
const tablesDB = new TablesDB(client);
const storage = new Storage(client);

const source = JSON.parse(
  await readFile("src/data/content-ru.json", "utf8"),
);
const items = [
  ...(source.thoughts ?? []),
  ...(source.messages ?? []),
  ...(source.images ?? []),
];

function stableId(prefix, value) {
  const safe = String(value)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[^a-z0-9]+/, "");
  if (safe.length >= 8 && safe.length <= 36) return safe;
  const hash = createHash("sha256").update(String(value)).digest("hex");
  return `${prefix}${hash.slice(0, 35)}`;
}

function plainText(value) {
  return String(value ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function appwriteType(item) {
  if (item.type === "gallery") return "gallery";
  if (item.type === "video" || item.type === "video_note") return "video";
  if (item.type === "gif") return "animation";
  if (item.url) return "image";
  return "text";
}

function mediaEntries(item) {
  if (Array.isArray(item.images)) return item.images;
  if (item.url) return [{ url: item.url, caption: item.caption }];
  return [];
}

function publicFileUrl(fileId) {
  const base = endpoint.replace(/\/$/, "");
  return `${base}/storage/buckets/${encodeURIComponent(bucketId)}/files/${encodeURIComponent(fileId)}/view?project=${encodeURIComponent(projectId)}`;
}

function articleTitle(item) {
  const source =
    plainText(item.captionHtml ?? item.caption) ||
    plainText(item.text ?? item.message ?? item.html).split("\n")[0] ||
    "Без названия";
  return source.length > 500 ? `${source.slice(0, 497)}...` : source;
}

function isNotFound(error) {
  return (
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === 404
  );
}

async function rowExists(tableId, rowId) {
  try {
    await tablesDB.getRow({ databaseId, tableId, rowId });
    return true;
  } catch (error) {
    if (isNotFound(error)) return false;
    throw error;
  }
}

const permissions = [
  Permission.read(Role.any()),
  Permission.update(Role.user(authorId)),
  Permission.delete(Role.user(authorId)),
];

for (const item of items) {
  const postId = stableId("p", item.id ?? `${item.ts}-${item.text}`);
  const postAlreadyExists = await rowExists(postsTableId, postId);

  const uploaded = [];
  const sourceMedia = mediaEntries(item);

  try {
    for (let position = 0; position < sourceMedia.length; position += 1) {
      const sourceItem = sourceMedia[position];
      const relativePath = String(sourceItem.url).replace(/^\/+/, "");
      const filePath = path.join("public", relativePath);
      const fileStats = await stat(filePath);
      const fileId = stableId("f", `${postId}-${position}-${relativePath}`);

      let remoteFile;
      try {
        remoteFile = await storage.getFile({ bucketId, fileId });
      } catch (error) {
        if (!isNotFound(error)) throw error;
        remoteFile = await storage.createFile({
          bucketId,
          fileId,
          file: InputFile.fromPath(filePath, path.basename(filePath)),
          permissions,
        });
      }

      const mediaRowId = stableId("m", `${postId}-${position}`);
      uploaded.push({
        rowId: mediaRowId,
        fileId,
        name: remoteFile.name,
        mimeType: remoteFile.mimeType,
        size: remoteFile.sizeOriginal ?? fileStats.size,
        alt: plainText(sourceItem.caption ?? item.captionHtml ?? item.caption),
        position,
      });
    }

    const text = plainText(item.text ?? item.message ?? item.html);
    const caption = plainText(item.captionHtml ?? item.caption);
    const type = appwriteType(item);
    const blocks = [];
    if (uploaded.length > 0) {
      blocks.push({
        id: `${postId}-media`,
        type,
        caption,
        alt: uploaded[0]?.alt ?? "",
        fileIds: uploaded.map((mediaItem) => mediaItem.fileId),
      });
    }
    if (text) {
      blocks.push({
        id: `${postId}-text`,
        type: "text",
        text,
      });
    }

    const postData = {
      authorId,
      authorName,
      type,
      title: articleTitle(item),
      blocksJson: JSON.stringify(blocks),
      text,
      caption,
      publishedAt: new Date(item.ts ?? Date.now()).toISOString(),
      featured: Boolean(item.featured),
    };

    if (postAlreadyExists) {
      await tablesDB.updateRow({
        databaseId,
        tableId: postsTableId,
        rowId: postId,
        data: postData,
        permissions,
      });
    } else {
      await tablesDB.createRow({
        databaseId,
        tableId: postsTableId,
        rowId: postId,
        data: postData,
        permissions,
      });
    }

    for (const mediaItem of uploaded) {
      const rowId = mediaItem.rowId || ID.unique();
      const data = {
        postId,
        fileId: mediaItem.fileId,
        url: publicFileUrl(mediaItem.fileId),
        name: mediaItem.name,
        mimeType: mediaItem.mimeType,
        size: mediaItem.size,
        width: 0,
        height: 0,
        alt: mediaItem.alt,
        position: mediaItem.position,
      };
      if (await rowExists(mediaTableId, rowId)) {
        await tablesDB.updateRow({
          databaseId,
          tableId: mediaTableId,
          rowId,
          data,
          permissions,
        });
      } else {
        await tablesDB.createRow({
          databaseId,
          tableId: mediaTableId,
          rowId,
          data,
          permissions,
        });
      }
    }

    console.log(`Синхронизирован пост: ${postId}`);
  } catch (error) {
    console.error(`Ошибка переноса ${postId}:`, error);
    throw error;
  }
}

console.log(`Готово. Обработано публикаций: ${items.length}`);
