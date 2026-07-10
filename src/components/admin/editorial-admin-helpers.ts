import imageCompression from "browser-image-compression";
import {
  contentBlockTypes,
  type ContentBlock,
  type ContentBlockType,
  type PostMediaRow,
  type PostRow,
} from "@/types/content";

export interface DraftBlock {
  id: string;
  type: ContentBlockType;
  text: string;
  caption: string;
  alt: string;
  fileIds: string[];
  files: File[];
}

export interface EditorState {
  postId: string | null;
  title: string;
  featured: boolean;
  blocks: DraftBlock[];
}

export const blockLabels: Record<ContentBlockType, string> = {
  text: "Текст",
  image: "Фото",
  gallery: "Карусель",
  video: "Видео",
  animation: "GIF / анимация",
};

const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
]);

const maxFileSize = 50_000_000;

export function createDraftBlock(
  type: ContentBlockType = "text",
): DraftBlock {
  return {
    id: crypto.randomUUID(),
    type,
    text: "",
    caption: "",
    alt: "",
    fileIds: [],
    files: [],
  };
}

export function createEmptyEditor(): EditorState {
  return {
    postId: null,
    title: "",
    featured: false,
    blocks: [createDraftBlock()],
  };
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Неизвестная ошибка";
}

function isImageType(type: string): boolean {
  return type.startsWith("image/");
}

export function titleForPost(post: PostRow): string {
  return (
    post.title?.trim() ||
    post.caption.trim() ||
    post.text.trim().split("\n")[0] ||
    "Без названия"
  );
}

export function parseBlocks(
  post: PostRow,
  attached: PostMediaRow[],
): DraftBlock[] {
  if (post.blocksJson) {
    try {
      const parsed = JSON.parse(post.blocksJson) as unknown;
      if (Array.isArray(parsed)) {
        const blocks = parsed.flatMap<DraftBlock>((value) => {
          if (!value || typeof value !== "object") return [];
          const candidate = value as Partial<ContentBlock>;
          if (
            typeof candidate.id !== "string" ||
            !contentBlockTypes.includes(candidate.type as ContentBlockType)
          ) {
            return [];
          }
          if (candidate.type === "text") {
            return [
              {
                id: candidate.id,
                type: "text",
                text:
                  "text" in candidate && typeof candidate.text === "string"
                    ? candidate.text
                    : "",
                caption: "",
                alt: "",
                fileIds: [],
                files: [],
              },
            ];
          }
          return [
            {
              id: candidate.id,
              type: candidate.type as Exclude<ContentBlockType, "text">,
              text: "",
              caption:
                "caption" in candidate && typeof candidate.caption === "string"
                  ? candidate.caption
                  : "",
              alt:
                "alt" in candidate && typeof candidate.alt === "string"
                  ? candidate.alt
                  : "",
              fileIds:
                "fileIds" in candidate && Array.isArray(candidate.fileIds)
                  ? candidate.fileIds.filter(
                      (fileId): fileId is string => typeof fileId === "string",
                    )
                  : [],
              files: [],
            },
          ];
        });
        if (blocks.length > 0) return blocks;
      }
    } catch {
      // Старые записи продолжают открываться через legacy-поля.
    }
  }

  const blocks: DraftBlock[] = [];
  if (post.text.trim()) {
    blocks.push({ ...createDraftBlock("text"), text: post.text });
  }
  if (post.type !== "text" && attached.length > 0) {
    blocks.push({
      ...createDraftBlock(post.type),
      caption: post.caption,
      alt: attached[0]?.alt ?? "",
      fileIds: attached.map((item) => item.fileId),
    });
  }
  return blocks.length > 0 ? blocks : [createDraftBlock()];
}

export function validateBlockFiles(
  type: ContentBlockType,
  files: File[],
): string | null {
  if (type === "text") return null;
  if (type !== "gallery" && files.length > 1) {
    return "Для этого блока можно выбрать только один файл.";
  }
  if (files.some((file) => !allowedMimeTypes.has(file.type))) {
    return "Разрешены JPG, PNG, WebP, GIF, MP4 и WebM.";
  }
  if (files.some((file) => file.size > maxFileSize)) {
    return "Размер одного файла не должен превышать 50 МБ.";
  }
  if (
    (type === "image" || type === "gallery") &&
    files.some((file) => !isImageType(file.type) || file.type === "image/gif")
  ) {
    return "Для фото и карусели используйте JPG, PNG или WebP.";
  }
  if (type === "video" && files.some((file) => !file.type.startsWith("video/"))) {
    return "Для видео используйте MP4 или WebM.";
  }
  if (
    type === "animation" &&
    files.some(
      (file) =>
        file.type !== "image/gif" &&
        file.type !== "video/mp4" &&
        file.type !== "video/webm",
    )
  ) {
    return "Для анимации используйте GIF, MP4 или WebM.";
  }
  return null;
}

export async function optimizeFile(file: File): Promise<File> {
  if (!isImageType(file.type) || file.type === "image/gif") return file;
  const compressed = await imageCompression(file, {
    maxSizeMB: 1.5,
    maxWidthOrHeight: 2200,
    useWebWorker: true,
    fileType: "image/webp",
  });
  const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
  return new File([compressed], `${baseName}.webp`, {
    type: "image/webp",
    lastModified: file.lastModified,
  });
}

export async function getMediaDimensions(
  file: File,
): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(file);
  try {
    if (isImageType(file.type)) {
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("Не удалось прочитать изображение"));
        image.src = url;
      });
      return { width: image.naturalWidth, height: image.naturalHeight };
    }
    if (file.type.startsWith("video/")) {
      const video = document.createElement("video");
      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error("Не удалось прочитать видео"));
        video.src = url;
      });
      return { width: video.videoWidth, height: video.videoHeight };
    }
    return { width: 0, height: 0 };
  } finally {
    URL.revokeObjectURL(url);
  }
}
