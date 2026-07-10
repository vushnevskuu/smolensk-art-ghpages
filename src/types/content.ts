import type { Models } from "appwrite";

export const postTypes = [
  "text",
  "image",
  "gallery",
  "video",
  "animation",
] as const;

export type PostType = (typeof postTypes)[number];

export interface PostRow extends Models.Row {
  authorId: string;
  authorName: string;
  type: PostType;
  text: string;
  caption: string;
  publishedAt: string;
  featured: boolean;
}

export interface PostMediaRow extends Models.Row {
  postId: string;
  fileId: string;
  url: string;
  name: string;
  mimeType: string;
  size: number;
  width: number;
  height: number;
  alt: string;
  position: number;
}

export interface ProfileRow extends Models.Row {
  name: string;
  email: string;
}

export interface LegacyMedia {
  url: string;
  caption?: string;
}

export interface LegacyFeedItem {
  id: string;
  type?: "message" | "image" | "gallery" | "video" | "gif";
  text?: string;
  caption?: string;
  url?: string;
  images?: LegacyMedia[];
  ts: number;
  featured?: boolean;
  featured_ts?: number;
}
