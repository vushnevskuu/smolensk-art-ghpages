import {
  Client,
  Compression,
  Permission,
  Role,
  Storage,
  TablesDB,
} from "node-appwrite";

const required = [
  "APPWRITE_ENDPOINT",
  "APPWRITE_PROJECT_ID",
  "APPWRITE_API_KEY",
];

for (const name of required) {
  if (!process.env[name]) {
    throw new Error(`Не задана переменная ${name}`);
  }
}

const endpoint = process.env.APPWRITE_ENDPOINT;
const projectId = process.env.APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;
const databaseId = process.env.APPWRITE_DATABASE_ID ?? "smolensk-art";
const profilesTableId = process.env.APPWRITE_PROFILES_TABLE_ID ?? "profiles";
const postsTableId = process.env.APPWRITE_POSTS_TABLE_ID ?? "posts";
const mediaTableId = process.env.APPWRITE_MEDIA_TABLE_ID ?? "post-media";
const bucketId = process.env.APPWRITE_BUCKET_ID ?? "post-media";

const client = new Client()
  .setEndpoint(endpoint)
  .setProject(projectId)
  .setKey(apiKey);

const tablesDB = new TablesDB(client);
const storage = new Storage(client);

function isConflict(error) {
  return (
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === 409
  );
}

function isNotFound(error) {
  return (
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === 404
  );
}

async function createOnce(label, callback) {
  try {
    await callback();
    console.log(`Создано: ${label}`);
  } catch (error) {
    if (isConflict(error)) {
      console.log(`Уже существует: ${label}`);
      return;
    }
    throw error;
  }
}

const authorCreate = [Permission.create(Role.label("author"))];

try {
  await tablesDB.get({ databaseId });
  console.log("Уже существует: база smolensk-art");
} catch (error) {
  if (!isNotFound(error)) throw error;
  await tablesDB.create({
    databaseId,
    name: "Смоленск Арт",
    enabled: true,
  });
  console.log("Создано: база smolensk-art");
}

await createOnce("таблица profiles", () =>
  tablesDB.createTable({
    databaseId,
    tableId: profilesTableId,
    name: "Профили авторов",
    permissions: authorCreate,
    rowSecurity: true,
    enabled: true,
    columns: [
      { key: "name", type: "string", size: 128, required: true },
      { key: "email", type: "string", size: 320, required: true },
    ],
    indexes: [
      {
        key: "email-unique",
        type: "unique",
        attributes: ["email"],
      },
    ],
  }),
);

await createOnce("таблица posts", () =>
  tablesDB.createTable({
    databaseId,
    tableId: postsTableId,
    name: "Публикации",
    permissions: authorCreate,
    rowSecurity: true,
    enabled: true,
    columns: [
      { key: "authorId", type: "string", size: 36, required: true },
      { key: "authorName", type: "string", size: 128, required: true },
      { key: "type", type: "string", size: 16, required: true },
      { key: "text", type: "string", size: 65535, required: true },
      { key: "caption", type: "string", size: 2000, required: true },
      { key: "publishedAt", type: "datetime", required: true },
      {
        key: "featured",
        type: "boolean",
        required: false,
        default: false,
      },
    ],
    indexes: [
      {
        key: "author-published",
        type: "key",
        attributes: ["authorId", "publishedAt"],
        orders: ["ASC", "DESC"],
      },
      {
        key: "published-at",
        type: "key",
        attributes: ["publishedAt"],
        orders: ["DESC"],
      },
    ],
  }),
);

await createOnce("таблица post-media", () =>
  tablesDB.createTable({
    databaseId,
    tableId: mediaTableId,
    name: "Медиа публикаций",
    permissions: authorCreate,
    rowSecurity: true,
    enabled: true,
    columns: [
      { key: "postId", type: "string", size: 36, required: true },
      { key: "fileId", type: "string", size: 36, required: true },
      { key: "url", type: "string", size: 2048, required: true },
      { key: "name", type: "string", size: 255, required: true },
      { key: "mimeType", type: "string", size: 100, required: true },
      { key: "size", type: "integer", required: true, min: 0 },
      { key: "width", type: "integer", required: true, min: 0 },
      { key: "height", type: "integer", required: true, min: 0 },
      { key: "alt", type: "string", size: 1000, required: true },
      { key: "position", type: "integer", required: true, min: 0 },
    ],
    indexes: [
      {
        key: "post-position",
        type: "key",
        attributes: ["postId", "position"],
        orders: ["ASC", "ASC"],
      },
      {
        key: "file-unique",
        type: "unique",
        attributes: ["fileId"],
      },
    ],
  }),
);

await createOnce("bucket post-media", () =>
  storage.createBucket({
    bucketId,
    name: "Медиа публикаций",
    permissions: authorCreate,
    fileSecurity: true,
    enabled: true,
    maximumFileSize: 50_000_000,
    allowedFileExtensions: ["jpg", "jpeg", "png", "webp", "gif", "mp4", "webm"],
    compression: Compression.None,
    encryption: true,
    antivirus: true,
    transformations: true,
  }),
);

console.log("\nAppwrite готов.");
console.log("Выдавайте приглашённым пользователям label `author`.");
