import {
  Account,
  Client,
  ID,
  Permission,
  Role,
  TablesDB,
  Users,
} from "node-appwrite";

for (const variable of [
  "APPWRITE_ENDPOINT",
  "APPWRITE_PROJECT_ID",
  "APPWRITE_API_KEY",
]) {
  if (!process.env[variable]) {
    throw new Error(`Не задана переменная ${variable}`);
  }
}

const endpoint = process.env.APPWRITE_ENDPOINT;
const projectId = process.env.APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;
const databaseId = process.env.APPWRITE_DATABASE_ID ?? "smolensk-art";
const postsTableId = process.env.APPWRITE_POSTS_TABLE_ID ?? "posts";

const serverClient = new Client()
  .setEndpoint(endpoint)
  .setProject(projectId)
  .setKey(apiKey);
const users = new Users(serverClient);

function isDenied(error) {
  return (
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error.code === 401 || error.code === 403 || error.code === 404)
  );
}

async function userClientFor(userId) {
  const token = await users.createToken({ userId, length: 64, expire: 900 });
  const sessionClient = new Client().setEndpoint(endpoint).setProject(projectId);
  const account = new Account(sessionClient);
  const session = await account.createSession({
    userId,
    secret: token.secret,
  });
  const jwt = await users.createJWT({
    userId,
    sessionId: session.$id,
    duration: 900,
  });
  return new Client().setEndpoint(endpoint).setProject(projectId).setJWT(jwt.jwt);
}

const suffix = Date.now().toString(36);
const first = await users.create({
  userId: ID.unique(),
  email: `permissions-a-${suffix}@example.com`,
  name: "Permission A",
});
const second = await users.create({
  userId: ID.unique(),
  email: `permissions-b-${suffix}@example.com`,
  name: "Permission B",
});
await users.updateLabels({ userId: first.$id, labels: ["author"] });
await users.updateLabels({ userId: second.$id, labels: ["author"] });

const rowId = ID.unique();

try {
  const firstTables = new TablesDB(await userClientFor(first.$id));
  const secondTables = new TablesDB(await userClientFor(second.$id));
  const guestTables = new TablesDB(
    new Client().setEndpoint(endpoint).setProject(projectId),
  );

  let guestWriteDenied = false;
  try {
    await guestTables.createRow({
      databaseId,
      tableId: postsTableId,
      rowId: ID.unique(),
      data: {
        authorId: "guest",
        authorName: "Guest",
        type: "text",
        text: "guest write",
        caption: "",
        publishedAt: new Date().toISOString(),
        featured: false,
      },
    });
  } catch (error) {
    guestWriteDenied = isDenied(error);
  }
  if (!guestWriteDenied) throw new Error("Гость смог создать запись");

  await firstTables.createRow({
    databaseId,
    tableId: postsTableId,
    rowId,
    data: {
      authorId: first.$id,
      authorName: first.name,
      type: "text",
      text: "permission test",
      caption: "",
      publishedAt: new Date().toISOString(),
      featured: false,
    },
    permissions: [
      Permission.read(Role.any()),
      Permission.update(Role.user(first.$id)),
      Permission.delete(Role.user(first.$id)),
    ],
  });

  const publicRow = await guestTables.getRow({
    databaseId,
    tableId: postsTableId,
    rowId,
  });
  if (publicRow.$id !== rowId) throw new Error("Гость не прочитал пост");

  let foreignUpdateDenied = false;
  try {
    await secondTables.updateRow({
      databaseId,
      tableId: postsTableId,
      rowId,
      data: { text: "foreign update" },
    });
  } catch (error) {
    foreignUpdateDenied = isDenied(error);
  }
  if (!foreignUpdateDenied) throw new Error("Другой автор изменил чужой пост");

  await firstTables.updateRow({
    databaseId,
    tableId: postsTableId,
    rowId,
    data: { text: "owner update" },
  });
  await firstTables.deleteRow({
    databaseId,
    tableId: postsTableId,
    rowId,
  });

  console.log("Permissions проверены: гость читает, автор владеет только своим.");
} finally {
  const serverTables = new TablesDB(serverClient);
  await serverTables
    .deleteRow({ databaseId, tableId: postsTableId, rowId })
    .catch(() => undefined);
  await users.delete({ userId: first.$id }).catch(() => undefined);
  await users.delete({ userId: second.$id }).catch(() => undefined);
}
