import type { Models } from "appwrite";

export const postTypes = [
  "text",
  "image",
  "gallery",
  "video",
  "animation",
] as const;

export type PostType = (typeof postTypes)[number];

export const contentBlockTypes = [
  "text",
  "image",
  "gallery",
  "video",
  "animation",
] as const;

export type ContentBlockType = (typeof contentBlockTypes)[number];

export interface TextContentBlock {
  id: string;
  type: "text";
  text: string;
}

export interface MediaContentBlock {
  id: string;
  type: Exclude<ContentBlockType, "text">;
  caption: string;
  alt: string;
  fileIds: string[];
}

export type ContentBlock = TextContentBlock | MediaContentBlock;

export interface PostRow extends Models.Row {
  authorId: string;
  authorName: string;
  type: PostType;
  title?: string;
  blocksJson?: string;
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
