import { Client, ID, Query, Users } from "node-appwrite";

const [email, ...nameParts] = process.argv.slice(2);
const name = nameParts.join(" ").trim() || email?.split("@")[0];

if (!email) {
  throw new Error(
    "Использование: npm run appwrite:invite -- author@example.com \"Имя\"",
  );
}

for (const variable of [
  "APPWRITE_ENDPOINT",
  "APPWRITE_PROJECT_ID",
  "APPWRITE_API_KEY",
]) {
  if (!process.env[variable]) {
    throw new Error(`Не задана переменная ${variable}`);
  }
}

const client = new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT)
  .setProject(process.env.APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);

const users = new Users(client);
const existing = await users.list({
  queries: [Query.equal("email", [email])],
  total: false,
});

const user =
  existing.users[0] ??
  (await users.create({
    userId: ID.unique(),
    email,
    name,
  }));

const labels = Array.from(new Set([...user.labels, "author"]));
await users.updateLabels({ userId: user.$id, labels });

console.log(`Автор приглашён: ${user.email} (${user.$id})`);
