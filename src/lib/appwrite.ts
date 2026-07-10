import {
  Account,
  Client,
  Storage,
  TablesDB,
} from "appwrite";

export const appwriteConfig = {
  endpoint: process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT ?? "",
  projectId: process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID ?? "",
  databaseId: process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID ?? "smolensk-art",
  postsTableId: process.env.NEXT_PUBLIC_APPWRITE_POSTS_TABLE_ID ?? "posts",
  mediaTableId: process.env.NEXT_PUBLIC_APPWRITE_MEDIA_TABLE_ID ?? "post-media",
  profilesTableId:
    process.env.NEXT_PUBLIC_APPWRITE_PROFILES_TABLE_ID ?? "profiles",
  bucketId: process.env.NEXT_PUBLIC_APPWRITE_BUCKET_ID ?? "post-media",
};

export const isAppwriteConfigured = Boolean(
  appwriteConfig.endpoint && appwriteConfig.projectId,
);

const client = new Client();

if (isAppwriteConfigured) {
  client
    .setEndpoint(appwriteConfig.endpoint)
    .setProject(appwriteConfig.projectId);
}

export const account = new Account(client);
export const tablesDB = new TablesDB(client);
export const storage = new Storage(client);

export function getMediaUrl(fileId: string): string {
  return storage.getFileView({
    bucketId: appwriteConfig.bucketId,
    fileId,
  });
}
