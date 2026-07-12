"use client";

import {
  ID,
  Permission,
  Query,
  Role,
  type Models,
} from "appwrite";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  FileImage,
  Film,
  Images,
  LoaderCircle,
  LogOut,
  Pencil,
  Plus,
  Send,
  Sparkles,
  Trash2,
  Type,
  Upload,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  blockLabels,
  createDraftBlock,
  createEmptyEditor,
  errorMessage,
  getMediaDimensions,
  optimizeFile,
  parseBlocks,
  titleForPost,
  validateBlockFiles,
  type DraftBlock,
  type EditorState,
} from "@/components/admin/editorial-admin-helpers";
import {
  account,
  appwriteConfig,
  getMediaUrl,
  isAppwriteConfigured,
  storage,
  tablesDB,
} from "@/lib/appwrite";
import {
  contentBlockTypes,
  type ContentBlock,
  type ContentBlockType,
  type PostMediaRow,
  type PostRow,
  type PostType,
  type ProfileRow,
} from "@/types/content";

type AppwriteUser = Models.User<Models.Preferences>;

function adminCallbackUrl() {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  if (!url.pathname.endsWith("/")) {
    url.pathname = `${url.pathname}/`;
  }
  return `${url.origin}${url.pathname}`;
}

const blockIcons: Record<ContentBlockType, typeof Type> = {
  text: Type,
  image: FileImage,
  gallery: Images,
  video: Film,
  animation: Sparkles,
};

export function EditorialAdminDashboard() {
  const [user, setUser] = useState<AppwriteUser | null>(null);
  const [email, setEmail] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [loadingSession, setLoadingSession] = useState(true);
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [media, setMedia] = useState<PostMediaRow[]>([]);
  const [editor, setEditor] = useState<EditorState>(createEmptyEditor);
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [notice, setNotice] = useState("");

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

  const mediaByFile = useMemo(
    () => new Map(media.map((item) => [item.fileId, item])),
    [media],
  );

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
    await tablesDB.upsertRow<ProfileRow>({
      databaseId: appwriteConfig.databaseId,
      tableId: appwriteConfig.profilesTableId,
      rowId: activeUser.$id,
      data: {
        name: activeUser.name || activeUser.email.split("@")[0],
        email: activeUser.email,
      },
      permissions: [
        Permission.read(Role.any()),
        Permission.update(Role.user(activeUser.$id)),
        Permission.delete(Role.user(activeUser.$id)),
      ],
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
          try {
            await account.createSession({ userId, secret });
            window.history.replaceState({}, "", adminCallbackUrl());
          } catch (error) {
            if (!cancelled) {
              setAuthMessage(
                `Ссылка для входа не сработала: ${errorMessage(error)}. Запросите новую.`,
              );
            }
            return;
          }
        }

        let activeUser: AppwriteUser;
        try {
          activeUser = await account.get();
        } catch {
          return;
        }

        if (!activeUser.labels.includes("author")) {
          await account.deleteSession({ sessionId: "current" });
          if (!cancelled) {
            setAuthMessage(
              "Этот email не приглашён как автор. Попросите администратора выполнить приглашение.",
            );
          }
          return;
        }

        if (cancelled) return;
        setUser(activeUser);
        await ensureProfile(activeUser);
        await loadPosts(activeUser);
      } catch (error) {
        if (!cancelled) {
          setUser(null);
          setAuthMessage(`Не удалось войти: ${errorMessage(error)}`);
        }
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
      await account.createMagicURLToken({
        userId: ID.unique(),
        email: email.trim(),
        url: adminCallbackUrl(),
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

  function resetEditor(message = "") {
    setEditor(createEmptyEditor());
    setUploadProgress(0);
    setNotice(message);
  }

  function updateBlock(blockId: string, patch: Partial<DraftBlock>) {
    setEditor((current) => ({
      ...current,
      blocks: current.blocks.map((block) =>
        block.id === blockId ? { ...block, ...patch } : block,
      ),
    }));
  }

  function moveBlock(index: number, direction: -1 | 1) {
    setEditor((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.blocks.length) return current;
      const blocks = [...current.blocks];
      [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
      return { ...current, blocks };
    });
  }

  function removeBlock(blockId: string) {
    setEditor((current) => {
      const blocks = current.blocks.filter((block) => block.id !== blockId);
      return {
        ...current,
        blocks: blocks.length > 0 ? blocks : [createDraftBlock()],
      };
    });
  }

  function addFiles(block: DraftBlock, incoming: File[]) {
    const next =
      block.type === "gallery"
        ? [...block.files, ...incoming]
        : incoming.slice(0, 1);
    const validation = validateBlockFiles(block.type, next);
    if (validation) {
      setNotice(validation);
      return;
    }
    updateBlock(block.id, { files: next });
    setNotice("");
  }

  function startEdit(post: PostRow) {
    setEditor({
      postId: post.$id,
      title: titleForPost(post),
      featured: post.featured,
      blocks: parseBlocks(post, mediaByPost.get(post.$id) ?? []),
    });
    setNotice("");
    window.scrollTo({ top: 0, behavior: "smooth" });
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

    const meaningfulBlocks = editor.blocks.filter((block) =>
      block.type === "text"
        ? Boolean(block.text.trim())
        : block.fileIds.length + block.files.length > 0,
    );
    if (!editor.title.trim()) {
      setNotice("Добавьте заголовок статьи.");
      return;
    }
    if (meaningfulBlocks.length === 0) {
      setNotice("Добавьте хотя бы один заполненный блок.");
      return;
    }
    for (const block of meaningfulBlocks) {
      const validation = validateBlockFiles(block.type, block.files);
      if (validation) {
        setNotice(validation);
        return;
      }
    }

    setBusy(true);
    setNotice("");
    setUploadProgress(0);

    const postId = editor.postId ?? ID.unique();
    const previousMedia = editor.postId
      ? (mediaByPost.get(editor.postId) ?? [])
      : [];
    const createdFiles: string[] = [];
    const createdRows: string[] = [];
    const permissions = [
      Permission.read(Role.any()),
      Permission.update(Role.user(user.$id)),
      Permission.delete(Role.user(user.$id)),
    ];

    try {
      const serializedBlocks: ContentBlock[] = [];
      let mediaPosition = 0;
      let uploadedCount = 0;
      const uploadTotal = meaningfulBlocks.reduce(
        (total, block) => total + block.files.length,
        0,
      );

      for (const block of meaningfulBlocks) {
        if (block.type === "text") {
          serializedBlocks.push({
            id: block.id,
            type: "text",
            text: block.text.trim(),
          });
          continue;
        }

        let fileIds = [...block.fileIds];
        if (block.files.length > 0) {
          fileIds = [];
          for (const sourceFile of block.files) {
            const file = await optimizeFile(sourceFile);
            const dimensions = await getMediaDimensions(file);
            const fileId = ID.unique();
            await storage.createFile({
              bucketId: appwriteConfig.bucketId,
              fileId,
              file,
              permissions,
              onProgress: (progress) => {
                const complete =
                  (uploadedCount + progress.progress / 100) /
                  Math.max(uploadTotal, 1);
                setUploadProgress(Math.round(complete * 100));
              },
            });
            createdFiles.push(fileId);
            const rowId = ID.unique();
            await tablesDB.createRow<PostMediaRow>({
              databaseId: appwriteConfig.databaseId,
              tableId: appwriteConfig.mediaTableId,
              rowId,
              data: {
                postId,
                fileId,
                url: getMediaUrl(fileId),
                name: file.name,
                mimeType: file.type,
                size: file.size,
                width: dimensions.width,
                height: dimensions.height,
                alt: block.alt.trim(),
                position: mediaPosition,
              },
              permissions,
            });
            createdRows.push(rowId);
            fileIds.push(fileId);
            uploadedCount += 1;
            mediaPosition += 1;
          }
        } else {
          mediaPosition += fileIds.length;
        }

        serializedBlocks.push({
          id: block.id,
          type: block.type,
          caption: block.caption.trim(),
          alt: block.alt.trim(),
          fileIds,
        });
      }

      const text = serializedBlocks
        .filter(
          (block): block is Extract<ContentBlock, { type: "text" }> =>
            block.type === "text",
        )
        .map((block) => block.text)
        .join("\n\n");
      const firstMedia = serializedBlocks.find(
        (block) => block.type !== "text",
      );
      const legacyType: PostType = firstMedia?.type ?? "text";
      const postData = {
        authorId: user.$id,
        authorName: user.name || user.email.split("@")[0],
        type: legacyType,
        title: editor.title.trim(),
        blocksJson: JSON.stringify(serializedBlocks),
        text,
        caption: editor.title.trim(),
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
          permissions,
        });
      }

      const retainedIds = new Set(
        serializedBlocks.flatMap((block) =>
          block.type === "text" ? [] : block.fileIds,
        ),
      );
      await deleteMediaRows(
        previousMedia.filter((item) => !retainedIds.has(item.fileId)),
      );
      await loadPosts(user);
      resetEditor(editor.postId ? "Статья обновлена." : "Статья опубликована.");
    } catch (error) {
      for (const rowId of createdRows) {
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
    if (!window.confirm("Удалить статью и все её файлы?")) return;
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
      setNotice("Статья удалена.");
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
          Админка не подключена: отсутствуют публичные переменные Appwrite.
        </StatusCard>
      </AdminShell>
    );
  }

  if (loadingSession) {
    return (
      <AdminShell>
        <StatusCard>
          <LoaderCircle className="size-5 animate-spin" />
          Проверяем вход...
        </StatusCard>
      </AdminShell>
    );
  }

  if (!user) {
    return (
      <AdminShell>
        <section className="mx-auto w-full max-w-md border border-black/15 bg-white/80 p-6 shadow-sm md:p-8">
          <p className="text-xs uppercase tracking-[0.18em] text-black/55">
            Вход для авторов
          </p>
          <h1 className="mt-3 text-3xl font-medium tracking-tight">Публикации</h1>
          <p className="mt-3 text-sm leading-6 text-black/65">
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
              className="w-full border border-black/20 bg-white px-4 py-3 outline-none transition focus:border-black"
              placeholder="author@example.com"
            />
            <button
              type="submit"
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 bg-black px-4 py-3 text-sm font-medium text-white transition hover:bg-black/80 disabled:opacity-50"
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
            <p className="mt-4 bg-black/5 p-3 text-sm">{authMessage}</p>
          )}
        </section>
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-black/55">
            Смоленск Арт
          </p>
          <h1 className="mt-2 text-3xl font-medium tracking-tight">
            Редактор статей
          </h1>
          <p className="mt-1 text-sm text-black/60">{user.email}</p>
        </div>
        <button
          type="button"
          onClick={() => void logout()}
          className="flex items-center gap-2 border border-black/20 bg-white/70 px-4 py-2 text-sm hover:bg-white"
        >
          <LogOut className="size-4" />
          Выйти
        </button>
      </header>

      <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
        <form
          onSubmit={submitPost}
          className="border border-black/15 bg-white/80 p-5 shadow-sm md:p-7"
        >
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-medium">
              {editor.postId ? "Редактировать статью" : "Новая статья"}
            </h2>
            {editor.postId && (
              <button
                type="button"
                onClick={() => resetEditor()}
                className="flex items-center gap-1 text-sm text-black/60 hover:text-black"
              >
                <ArrowLeft className="size-4" />
                Отмена
              </button>
            )}
          </div>

          <label className="mt-6 block text-sm font-medium" htmlFor="post-title">
            Заголовок
          </label>
          <input
            id="post-title"
            value={editor.title}
            onChange={(event) =>
              setEditor((current) => ({
                ...current,
                title: event.target.value,
              }))
            }
            className="mt-2 w-full border border-black/20 bg-white px-4 py-3 text-lg outline-none focus:border-black"
            placeholder="Название статьи"
          />

          <div className="mt-7 flex items-center justify-between">
            <h3 className="font-medium">Содержание</h3>
            <span className="text-xs text-black/45">
              Порядок блоков можно менять
            </span>
          </div>

          <div className="mt-3 space-y-3">
            {editor.blocks.map((block, index) => (
              <ContentBlockEditor
                key={block.id}
                block={block}
                index={index}
                total={editor.blocks.length}
                mediaByFile={mediaByFile}
                onChange={(patch) => updateBlock(block.id, patch)}
                onFiles={(files) => addFiles(block, files)}
                onMove={(direction) => moveBlock(index, direction)}
                onRemove={() => removeBlock(block.id)}
              />
            ))}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {contentBlockTypes.map((type) => {
              const Icon = blockIcons[type];
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() =>
                    setEditor((current) => ({
                      ...current,
                      blocks: [...current.blocks, createDraftBlock(type)],
                    }))
                  }
                  className="flex min-h-11 items-center justify-center gap-2 border border-black/15 bg-white px-2 py-2 text-xs transition hover:border-black/50"
                >
                  <Icon className="size-3.5" />
                  {blockLabels[type]}
                </button>
              );
            })}
          </div>

          <label className="mt-6 flex items-center gap-3 text-sm">
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
            Закрепить статью наверху
          </label>

          {uploadProgress > 0 && uploadProgress < 100 && (
            <div className="mt-5">
              <progress
                className="h-2 w-full accent-black"
                value={uploadProgress}
                max={100}
              />
              <p className="mt-2 text-xs text-black/55">
                Загружено {uploadProgress}%
              </p>
            </div>
          )}

          {notice && <p className="mt-5 bg-black/5 p-3 text-sm">{notice}</p>}

          <button
            type="submit"
            disabled={busy}
            className="mt-6 flex w-full items-center justify-center gap-2 bg-black px-4 py-3 text-sm font-medium text-white hover:bg-black/80 disabled:opacity-50"
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
          <h2 className="text-xl font-medium">Мои статьи</h2>
          <div className="mt-4 space-y-3">
            {posts.length === 0 && (
              <div className="border border-black/15 bg-white/60 p-5 text-sm text-black/60">
                Публикаций пока нет.
              </div>
            )}
            {posts.map((post) => (
              <article
                key={post.$id}
                className="border border-black/15 bg-white/75 p-4"
              >
                <time className="text-xs tabular-nums text-black/50">
                  {new Date(post.publishedAt).toLocaleDateString("ru-RU")}
                </time>
                <h3 className="mt-2 text-base leading-6">{titleForPost(post)}</h3>
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => startEdit(post)}
                    className="flex items-center gap-1 border border-black/15 px-3 py-2 text-xs hover:bg-white"
                  >
                    <Pencil className="size-3.5" />
                    Изменить
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void deletePost(post)}
                    className="flex items-center gap-1 border border-red-300 px-3 py-2 text-xs text-red-800 hover:bg-red-50 disabled:opacity-50"
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

interface ContentBlockEditorProps {
  block: DraftBlock;
  index: number;
  total: number;
  mediaByFile: Map<string, PostMediaRow>;
  onChange: (patch: Partial<DraftBlock>) => void;
  onFiles: (files: File[]) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}

function ContentBlockEditor({
  block,
  index,
  total,
  mediaByFile,
  onChange,
  onFiles,
  onMove,
  onRemove,
}: ContentBlockEditorProps) {
  return (
    <section className="border border-black/15 bg-white p-4">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span className="text-black/40">{index + 1}</span>
          {blockLabels[block.type]}
        </div>
        <div className="flex items-center gap-1">
          <IconButton
            label="Переместить выше"
            disabled={index === 0}
            onClick={() => onMove(-1)}
          >
            <ArrowUp className="size-4" />
          </IconButton>
          <IconButton
            label="Переместить ниже"
            disabled={index === total - 1}
            onClick={() => onMove(1)}
          >
            <ArrowDown className="size-4" />
          </IconButton>
          <IconButton label="Удалить блок" onClick={onRemove}>
            <Trash2 className="size-4" />
          </IconButton>
        </div>
      </header>

      {block.type === "text" ? (
        <textarea
          rows={7}
          value={block.text}
          onChange={(event) => onChange({ text: event.target.value })}
          className="mt-4 w-full resize-y border border-black/15 px-4 py-3 leading-6 outline-none focus:border-black"
          placeholder="Текстовый фрагмент"
          aria-label={`Текст блока ${index + 1}`}
        />
      ) : (
        <>
          <label className="mt-4 block text-xs font-medium">
            Подпись
            <input
              value={block.caption}
              onChange={(event) => onChange({ caption: event.target.value })}
              className="mt-2 w-full border border-black/15 px-3 py-2 text-sm outline-none focus:border-black"
            />
          </label>
          <label className="mt-3 block text-xs font-medium">
            Описание для незрячих
            <input
              value={block.alt}
              onChange={(event) => onChange({ alt: event.target.value })}
              className="mt-2 w-full border border-black/15 px-3 py-2 text-sm outline-none focus:border-black"
              placeholder="Что изображено"
            />
          </label>

          {block.fileIds.length > 0 && block.files.length === 0 && (
            <ul className="mt-3 space-y-2">
              {block.fileIds.map((fileId) => {
                const item = mediaByFile.get(fileId);
                return (
                  <li
                    key={fileId}
                    className="flex items-center justify-between gap-3 bg-black/5 px-3 py-2 text-xs"
                  >
                    <span className="min-w-0 truncate">
                      {item?.name ?? fileId}
                    </span>
                    <button
                      type="button"
                      aria-label={`Убрать ${item?.name ?? "файл"}`}
                      onClick={() =>
                        onChange({
                          fileIds: block.fileIds.filter((id) => id !== fileId),
                        })
                      }
                    >
                      <Trash2 className="size-4 text-black/50 hover:text-red-700" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <label
            className="mt-3 block cursor-pointer border border-dashed border-black/25 bg-black/[0.025] p-5 text-center transition hover:bg-black/[0.05]"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              onFiles(Array.from(event.dataTransfer.files));
            }}
          >
            <input
              type="file"
              multiple={block.type === "gallery"}
              accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm"
              className="sr-only"
              onChange={(event) =>
                onFiles(Array.from(event.target.files ?? []))
              }
            />
            <Upload className="mx-auto size-5" />
            <span className="mt-2 block text-xs font-medium">
              {block.fileIds.length > 0
                ? "Заменить файлы"
                : "Выбрать или перетащить файлы"}
            </span>
          </label>

          {block.files.length > 0 && (
            <ul className="mt-3 space-y-2">
              {block.files.map((file, fileIndex) => (
                <li
                  key={`${file.name}-${file.lastModified}-${fileIndex}`}
                  className="flex items-center gap-3 border border-black/10 p-2"
                >
                  <SelectedMediaPreview file={file} />
                  <span className="min-w-0 flex-1 truncate text-xs">
                    {file.name}
                  </span>
                  <button
                    type="button"
                    aria-label={`Убрать ${file.name}`}
                    onClick={() =>
                      onChange({
                        files: block.files.filter(
                          (_, index) => index !== fileIndex,
                        ),
                      })
                    }
                  >
                    <Trash2 className="size-4 text-black/50 hover:text-red-700" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-9 place-items-center border border-black/10 text-black/60 hover:bg-black/5 hover:text-black disabled:opacity-25"
    >
      {children}
    </button>
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
    <div className="mx-auto flex max-w-lg items-center justify-center gap-3 border border-black/15 bg-white/70 p-6 text-sm">
      {children}
    </div>
  );
}

function SelectedMediaPreview({ file }: { file: File }) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  if (file.type.startsWith("video/")) {
    return (
      <video
        src={url}
        muted
        playsInline
        className="size-10 shrink-0 object-cover"
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- local preview
    <img src={url} alt="" className="size-10 shrink-0 object-cover" />
  );
}
