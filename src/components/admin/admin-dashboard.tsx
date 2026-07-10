"use client";

import imageCompression from "browser-image-compression";
import {
  ID,
  Permission,
  Query,
  Role,
  type Models,
} from "appwrite";
import {
  ArrowLeft,
  Check,
  GripVertical,
  LoaderCircle,
  LogOut,
  Pencil,
  Plus,
  Send,
  Trash2,
  Upload,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  account,
  appwriteConfig,
  getMediaUrl,
  isAppwriteConfigured,
  storage,
  tablesDB,
} from "@/lib/appwrite";
import {
  postTypes,
  type PostMediaRow,
  type PostRow,
  type PostType,
  type ProfileRow,
} from "@/types/content";

type AppwriteUser = Models.User<Models.Preferences>;

interface EditorState {
  postId: string | null;
  type: PostType;
  text: string;
  caption: string;
  alt: string;
  featured: boolean;
}

const emptyEditor: EditorState = {
  postId: null,
  type: "text",
  text: "",
  caption: "",
  alt: "",
  featured: false,
};

const postTypeLabels: Record<PostType, string> = {
  text: "Текст",
  image: "Фото",
  gallery: "Галерея",
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

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Неизвестная ошибка";
}

function requiresMedia(type: PostType): boolean {
  return type !== "text";
}

function isImageType(type: string): boolean {
  return type.startsWith("image/");
}

async function optimizeFile(file: File): Promise<File> {
  if (!isImageType(file.type) || file.type === "image/gif") return file;

  const compressed = await imageCompression(file, {
    maxSizeMB: 1.5,
    maxWidthOrHeight: 2000,
    useWebWorker: true,
    fileType: "image/webp",
  });

  const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
  return new File([compressed], `${baseName}.webp`, {
    type: "image/webp",
    lastModified: file.lastModified,
  });
}

async function getMediaDimensions(
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

function validateFiles(type: PostType, files: File[]): string | null {
  if (!requiresMedia(type) && files.length > 0) {
    return "Для текстового поста файлы не нужны.";
  }
  if (requiresMedia(type) && files.length === 0) {
    return "Добавьте файл.";
  }
  if (type !== "gallery" && files.length > 1) {
    return "Для этого типа поста можно выбрать только один файл.";
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
    return "Для фото и галереи используйте JPG, PNG или WebP.";
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

export function AdminDashboard() {
  const [user, setUser] = useState<AppwriteUser | null>(null);
  const [email, setEmail] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [loadingSession, setLoadingSession] = useState(true);
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [media, setMedia] = useState<PostMediaRow[]>([]);
  const [editor, setEditor] = useState<EditorState>(emptyEditor);
  const [files, setFiles] = useState<File[]>([]);
  const [existingMedia, setExistingMedia] = useState<PostMediaRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [notice, setNotice] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const mediaByPost = useMemo(() => {
    const grouped = new Map<string, PostMediaRow[]>();
    media.forEach((item) => {
      const current = grouped.get(item.postId) ?? [];
      current.push(item);
      grouped.set(item.postId, current);
    });
    grouped.forEach((items) => items.sort((a, b) => a.position - b.position));
    return grouped;
  }, [media]);

  const loadPosts = useCallback(async (activeUser: AppwriteUser) => {
    const postResult = await tablesDB.listRows<PostRow>({
      databaseId: appwriteConfig.databaseId,
      tableId: appwriteConfig.postsTableId,
      queries: [
        Query.equal("authorId", [activeUser.$id]),
        Query.orderDesc("publishedAt"),
        Query.limit(100),
      ],
      total: false,
    });

    const postIds = postResult.rows.map((post) => post.$id);
    let mediaRows: PostMediaRow[] = [];
    if (postIds.length > 0) {
      const mediaResult = await tablesDB.listRows<PostMediaRow>({
        databaseId: appwriteConfig.databaseId,
        tableId: appwriteConfig.mediaTableId,
        queries: [Query.equal("postId", postIds), Query.limit(500)],
        total: false,
      });
      mediaRows = mediaResult.rows;
    }

    setPosts(postResult.rows);
    setMedia(mediaRows);
  }, []);

  const ensureProfile = useCallback(async (activeUser: AppwriteUser) => {
    const permissions = [
      Permission.read(Role.any()),
      Permission.update(Role.user(activeUser.$id)),
      Permission.delete(Role.user(activeUser.$id)),
    ];

    await tablesDB.upsertRow<ProfileRow>({
      databaseId: appwriteConfig.databaseId,
      tableId: appwriteConfig.profilesTableId,
      rowId: activeUser.$id,
      data: {
        name: activeUser.name || activeUser.email.split("@")[0],
        email: activeUser.email,
      },
      permissions,
    });
  }, []);

  useEffect(() => {
    if (!isAppwriteConfigured) {
      setLoadingSession(false);
      return;
    }

    let cancelled = false;

    async function initialize() {
      try {
        const params = new URLSearchParams(window.location.search);
        const userId = params.get("userId");
        const secret = params.get("secret");

        if (userId && secret) {
          await account.createSession({ userId, secret });
          window.history.replaceState({}, "", window.location.pathname);
        }

        const activeUser = await account.get();
        if (!activeUser.labels.includes("author")) {
          await account.deleteSession({ sessionId: "current" });
          throw new Error("Пользователь не приглашён");
        }
        if (cancelled) return;
        setUser(activeUser);
        await ensureProfile(activeUser);
        await loadPosts(activeUser);
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoadingSession(false);
      }
    }

    void initialize();
    return () => {
      cancelled = true;
    };
  }, [ensureProfile, loadPosts]);

  async function requestMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setAuthMessage("");
    try {
      const redirectUrl = `${window.location.origin}${window.location.pathname}`;
      await account.createMagicURLToken({
        userId: ID.unique(),
        email: email.trim(),
        url: redirectUrl,
      });
      setAuthMessage("Ссылка для входа отправлена. Проверьте почту.");
    } catch {
      setAuthMessage(
        "Вход не разрешён. Администратор должен заранее пригласить этот email.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await account.deleteSession({ sessionId: "current" });
    setUser(null);
    setPosts([]);
    setMedia([]);
  }

  function resetEditor() {
    setEditor(emptyEditor);
    setFiles([]);
    setExistingMedia([]);
    setUploadProgress(0);
    setNotice("");
  }

  function startEdit(post: PostRow) {
    const attached = mediaByPost.get(post.$id) ?? [];
    setEditor({
      postId: post.$id,
      type: post.type,
      text: post.text,
      caption: post.caption,
      alt: attached[0]?.alt ?? "",
      featured: post.featured,
    });
    setExistingMedia(attached);
    setFiles([]);
    setNotice("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function addFiles(incoming: File[]) {
    const next =
      editor.type === "gallery" ? [...files, ...incoming] : incoming.slice(0, 1);
    const validation = validateFiles(editor.type, next);
    if (validation) {
      setNotice(validation);
      return;
    }
    setNotice("");
    setFiles(next);
  }

  function reorderFiles(targetIndex: number) {
    if (dragIndex === null || dragIndex === targetIndex) return;
    setFiles((current) => {
      const next = [...current];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
    setDragIndex(null);
  }

  async function deleteMediaRows(items: PostMediaRow[]) {
    for (const item of items) {
      await storage.deleteFile({
        bucketId: appwriteConfig.bucketId,
        fileId: item.fileId,
      });
      await tablesDB.deleteRow({
        databaseId: appwriteConfig.databaseId,
        tableId: appwriteConfig.mediaTableId,
        rowId: item.$id,
      });
    }
  }

  async function submitPost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;

    const replacingMedia = files.length > 0;
    const validation =
      editor.postId && existingMedia.length > 0 && !replacingMedia
        ? null
        : validateFiles(editor.type, files);

    if (validation) {
      setNotice(validation);
      return;
    }
    if (!editor.text.trim() && !editor.caption.trim()) {
      setNotice("Добавьте текст или подпись.");
      return;
    }

    setBusy(true);
    setNotice("");
    setUploadProgress(0);

    const postId = editor.postId ?? ID.unique();
    const removingMedia = editor.type === "text" && existingMedia.length > 0;
    const createdFiles: string[] = [];
    const createdMediaRows: string[] = [];
    const userPermissions = [
      Permission.read(Role.any()),
      Permission.update(Role.user(user.$id)),
      Permission.delete(Role.user(user.$id)),
    ];

    try {
      const uploaded: Array<{
        fileId: string;
        file: File;
        width: number;
        height: number;
      }> = [];

      for (let index = 0; index < files.length; index += 1) {
        const optimized = await optimizeFile(files[index]);
        const dimensions = await getMediaDimensions(optimized);
        const fileId = ID.unique();
        await storage.createFile({
          bucketId: appwriteConfig.bucketId,
          fileId,
          file: optimized,
          permissions: userPermissions,
          onProgress: (progress) => {
            const complete = (index + progress.progress / 100) / files.length;
            setUploadProgress(Math.round(complete * 100));
          },
        });
        createdFiles.push(fileId);
        uploaded.push({ fileId, file: optimized, ...dimensions });
      }

      const postData = {
        authorId: user.$id,
        authorName: user.name || user.email.split("@")[0],
        type: editor.type,
        text: editor.text.trim(),
        caption: editor.caption.trim(),
        publishedAt:
          posts.find((post) => post.$id === postId)?.publishedAt ??
          new Date().toISOString(),
        featured: editor.featured,
      };

      if (editor.postId) {
        await tablesDB.updateRow<PostRow>({
          databaseId: appwriteConfig.databaseId,
          tableId: appwriteConfig.postsTableId,
          rowId: postId,
          data: postData,
        });
      } else {
        await tablesDB.createRow<PostRow>({
          databaseId: appwriteConfig.databaseId,
          tableId: appwriteConfig.postsTableId,
          rowId: postId,
          data: postData,
          permissions: userPermissions,
        });
      }

      for (let index = 0; index < uploaded.length; index += 1) {
        const item = uploaded[index];
        const rowId = ID.unique();
        await tablesDB.createRow<PostMediaRow>({
          databaseId: appwriteConfig.databaseId,
          tableId: appwriteConfig.mediaTableId,
          rowId,
          data: {
            postId,
            fileId: item.fileId,
            url: getMediaUrl(item.fileId),
            name: item.file.name,
            mimeType: item.file.type,
            size: item.file.size,
            width: item.width,
            height: item.height,
            alt: editor.alt.trim(),
            position: index,
          },
          permissions: userPermissions,
        });
        createdMediaRows.push(rowId);
      }

      if (editor.postId && replacingMedia) {
        await deleteMediaRows(existingMedia);
      } else if (editor.postId && removingMedia) {
        await deleteMediaRows(existingMedia);
      }

      await loadPosts(user);
      resetEditor();
      setNotice("Пост опубликован.");
    } catch (error) {
      for (const rowId of createdMediaRows) {
        await tablesDB
          .deleteRow({
            databaseId: appwriteConfig.databaseId,
            tableId: appwriteConfig.mediaTableId,
            rowId,
          })
          .catch(() => undefined);
      }
      for (const fileId of createdFiles) {
        await storage
          .deleteFile({ bucketId: appwriteConfig.bucketId, fileId })
          .catch(() => undefined);
      }
      if (!editor.postId) {
        await tablesDB
          .deleteRow({
            databaseId: appwriteConfig.databaseId,
            tableId: appwriteConfig.postsTableId,
            rowId: postId,
          })
          .catch(() => undefined);
      }
      setNotice(`Не удалось сохранить: ${errorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function deletePost(post: PostRow) {
    if (!window.confirm("Удалить пост и все его файлы?")) return;
    setBusy(true);
    setNotice("");
    try {
      await deleteMediaRows(mediaByPost.get(post.$id) ?? []);
      await tablesDB.deleteRow({
        databaseId: appwriteConfig.databaseId,
        tableId: appwriteConfig.postsTableId,
        rowId: post.$id,
      });
      if (user) await loadPosts(user);
      if (editor.postId === post.$id) resetEditor();
      setNotice("Пост удалён.");
    } catch (error) {
      setNotice(`Не удалось удалить: ${errorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  if (!isAppwriteConfigured) {
    return (
      <AdminShell>
        <StatusCard>
          Админка ещё не подключена: отсутствуют публичные переменные Appwrite.
        </StatusCard>
      </AdminShell>
    );
  }

  if (loadingSession) {
    return (
      <AdminShell>
        <StatusCard>
          <LoaderCircle className="size-5 animate-spin" />
          Проверяем вход…
        </StatusCard>
      </AdminShell>
    );
  }

  if (!user) {
    return (
      <AdminShell>
        <section className="mx-auto w-full max-w-md rounded-3xl border border-black/10 bg-white/80 p-6 shadow-sm backdrop-blur md:p-8">
          <p className="text-xs uppercase tracking-[0.22em] text-black/50">
            Вход для авторов
          </p>
          <h1 className="mt-3 text-3xl font-medium tracking-tight">
            Публикации
          </h1>
          <p className="mt-3 text-sm leading-6 text-black/60">
            Введите приглашённый email. Мы отправим одноразовую ссылку для
            входа.
          </p>
          <form className="mt-8 space-y-4" onSubmit={requestMagicLink}>
            <label className="block text-sm font-medium" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-xl border border-black/15 bg-white px-4 py-3 outline-none transition focus:border-black"
              placeholder="author@example.com"
            />
            <button
              type="submit"
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-4 py-3 text-sm font-medium text-white transition hover:bg-black/80 disabled:opacity-50"
            >
              {busy ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              Получить ссылку
            </button>
          </form>
          {authMessage && (
            <p className="mt-4 rounded-xl bg-black/5 p-3 text-sm">
              {authMessage}
            </p>
          )}
        </section>
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-black/50">
            Смоленск Арт
          </p>
          <h1 className="mt-2 text-3xl font-medium tracking-tight">
            Управление публикациями
          </h1>
          <p className="mt-1 text-sm text-black/55">{user.email}</p>
        </div>
        <button
          type="button"
          onClick={() => void logout()}
          className="flex items-center gap-2 rounded-xl border border-black/15 bg-white/70 px-4 py-2 text-sm hover:bg-white"
        >
          <LogOut className="size-4" />
          Выйти
        </button>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.72fr)]">
        <form
          onSubmit={submitPost}
          className="rounded-3xl border border-black/10 bg-white/80 p-5 shadow-sm md:p-7"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-medium">
              {editor.postId ? "Редактировать пост" : "Новый пост"}
            </h2>
            {editor.postId && (
              <button
                type="button"
                onClick={resetEditor}
                className="flex items-center gap-1 text-sm text-black/55 hover:text-black"
              >
                <ArrowLeft className="size-4" />
                Отмена
              </button>
            )}
          </div>

          <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {postTypes.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => {
                  setEditor((current) => ({ ...current, type }));
                  setFiles([]);
                }}
                className={`rounded-xl border px-3 py-2 text-sm transition ${
                  editor.type === type
                    ? "border-black bg-black text-white"
                    : "border-black/10 bg-white hover:border-black/30"
                }`}
              >
                {postTypeLabels[type]}
              </button>
            ))}
          </div>

          <label className="mt-6 block text-sm font-medium" htmlFor="post-text">
            Текст
          </label>
          <textarea
            id="post-text"
            rows={8}
            value={editor.text}
            onChange={(event) =>
              setEditor((current) => ({
                ...current,
                text: event.target.value,
              }))
            }
            className="mt-2 w-full resize-y rounded-xl border border-black/15 bg-white px-4 py-3 leading-6 outline-none focus:border-black"
            placeholder="Текст публикации и #хэштеги"
          />

          {requiresMedia(editor.type) && (
            <>
              <label
                className="mt-5 block text-sm font-medium"
                htmlFor="post-caption"
              >
                Подпись к медиа
              </label>
              <input
                id="post-caption"
                value={editor.caption}
                onChange={(event) =>
                  setEditor((current) => ({
                    ...current,
                    caption: event.target.value,
                  }))
                }
                className="mt-2 w-full rounded-xl border border-black/15 bg-white px-4 py-3 outline-none focus:border-black"
              />

              <label
                className="mt-5 block text-sm font-medium"
                htmlFor="post-alt"
              >
                Описание для незрячих
              </label>
              <input
                id="post-alt"
                value={editor.alt}
                onChange={(event) =>
                  setEditor((current) => ({
                    ...current,
                    alt: event.target.value,
                  }))
                }
                className="mt-2 w-full rounded-xl border border-black/15 bg-white px-4 py-3 outline-none focus:border-black"
                placeholder="Что изображено на фото или видео"
              />

              <label
                className="mt-5 block cursor-pointer rounded-2xl border border-dashed border-black/25 bg-black/[0.025] p-7 text-center transition hover:bg-black/[0.05]"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  addFiles(Array.from(event.dataTransfer.files));
                }}
              >
                <input
                  type="file"
                  multiple={editor.type === "gallery"}
                  accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm"
                  className="sr-only"
                  onChange={(event) =>
                    addFiles(Array.from(event.target.files ?? []))
                  }
                />
                <Upload className="mx-auto size-6" />
                <span className="mt-2 block text-sm font-medium">
                  Выбрать или перетащить файлы
                </span>
                <span className="mt-1 block text-xs text-black/50">
                  JPG, PNG, WebP, GIF, MP4, WebM — до 50 МБ
                </span>
              </label>

              {existingMedia.length > 0 && files.length === 0 && (
                <div className="mt-3 rounded-xl bg-black/5 p-3 text-sm">
                  Загружено файлов: {existingMedia.length}. Выберите новые,
                  чтобы заменить их.
                </div>
              )}

              {files.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {files.map((file, index) => (
                    <li
                      key={`${file.name}-${file.lastModified}`}
                      draggable={editor.type === "gallery"}
                      onDragStart={() => setDragIndex(index)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => reorderFiles(index)}
                      className="flex items-center gap-3 rounded-xl border border-black/10 bg-white p-3"
                    >
                      <GripVertical className="size-4 shrink-0 text-black/35" />
                      <SelectedMediaPreview file={file} />
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {file.name}
                      </span>
                      <span className="text-xs text-black/45">
                        {(file.size / 1024 / 1024).toFixed(1)} МБ
                      </span>
                      <button
                        type="button"
                        aria-label={`Убрать ${file.name}`}
                        onClick={() =>
                          setFiles((current) =>
                            current.filter((_, itemIndex) => itemIndex !== index),
                          )
                        }
                      >
                        <Trash2 className="size-4 text-black/45 hover:text-red-600" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          <label className="mt-5 flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={editor.featured}
              onChange={(event) =>
                setEditor((current) => ({
                  ...current,
                  featured: event.target.checked,
                }))
              }
              className="size-4"
            />
            Закрепить публикацию наверху
          </label>

          {uploadProgress > 0 && uploadProgress < 100 && (
            <div className="mt-5">
              <progress
                className="h-2 w-full accent-black"
                value={uploadProgress}
                max={100}
              />
              <p className="mt-2 text-xs text-black/50">
                Загружено {uploadProgress}%
              </p>
            </div>
          )}

          {notice && (
            <p className="mt-5 rounded-xl bg-black/5 p-3 text-sm">{notice}</p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-black px-4 py-3 text-sm font-medium text-white hover:bg-black/80 disabled:opacity-50"
          >
            {busy ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : editor.postId ? (
              <Check className="size-4" />
            ) : (
              <Plus className="size-4" />
            )}
            {editor.postId ? "Сохранить" : "Опубликовать"}
          </button>
        </form>

        <section>
          <h2 className="text-xl font-medium">Мои публикации</h2>
          <div className="mt-4 space-y-3">
            {posts.length === 0 && (
              <div className="rounded-2xl border border-black/10 bg-white/60 p-5 text-sm text-black/55">
                Публикаций пока нет.
              </div>
            )}
            {posts.map((post) => (
              <article
                key={post.$id}
                className="rounded-2xl border border-black/10 bg-white/75 p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-[0.15em] text-black/45">
                      {postTypeLabels[post.type]} ·{" "}
                      {new Date(post.publishedAt).toLocaleDateString("ru-RU")}
                    </p>
                    <p className="mt-2 line-clamp-3 whitespace-pre-line text-sm leading-6">
                      {post.caption || post.text || "Без текста"}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-1 text-[11px] text-emerald-800">
                    Опубликован
                  </span>
                </div>
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => startEdit(post)}
                    className="flex items-center gap-1 rounded-lg border border-black/10 px-3 py-2 text-xs hover:bg-white"
                  >
                    <Pencil className="size-3.5" />
                    Изменить
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void deletePost(post)}
                    className="flex items-center gap-1 rounded-lg border border-red-200 px-3 py-2 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    <Trash2 className="size-3.5" />
                    Удалить
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </AdminShell>
  );
}

function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-[#d4d0cd] px-4 py-8 text-black md:px-8 md:py-12">
      <div className="mx-auto w-full max-w-6xl">{children}</div>
    </main>
  );
}

function StatusCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-lg items-center justify-center gap-3 rounded-2xl border border-black/10 bg-white/70 p-6 text-sm">
      {children}
    </div>
  );
}

function SelectedMediaPreview({ file }: { file: File }) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);

  useEffect(() => {
    return () => URL.revokeObjectURL(url);
  }, [url]);

  if (file.type.startsWith("video/")) {
    return (
      <video
        src={url}
        muted
        playsInline
        className="size-10 shrink-0 rounded-md object-cover"
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- preview uses a local object URL
    <img
      src={url}
      alt=""
      className="size-10 shrink-0 rounded-md object-cover"
    />
  );
}
