# Смоленск Арт

Статический сайт сообщества: двухколоночный архив статей, админка приглашённых
авторов, медиа и фон «Солнечный день». Фронтенд публикуется на **GitHub Pages**,
Auth/Database/Storage работают в **Appwrite Cloud**.

**Онлайн:** [vushnevskuu.github.io/smolensk-art-ghpages](https://vushnevskuu.github.io/smolensk-art-ghpages/)

## Разработка

```bash
npm install
npm run dev
```

Админка: `/admin/`. Статья собирается из блоков текста, фото, каруселей, видео
и анимаций в произвольном порядке. Если Appwrite временно недоступен, публичная
страница показывает сохранённую копию из `src/data/content-ru.json`.

Публичные переменные перечислены в `.env.example`.

## Appwrite

1. Создайте бесплатный проект Appwrite Cloud и API key со служебными scopes
   для Databases, Tables, Columns, Indexes, Storage, Users и Project.
2. Скопируйте `.env.example` в `.env.appwrite.local`, заполните `APPWRITE_*`
   и `NEXT_PUBLIC_APPWRITE_*`.
3. Создайте защищённую схему:

```bash
npm run appwrite:setup
```

Новый автор создаётся только служебным скриптом. Он получает серверный label
`author`; клиент не может выдать этот label себе или изменить чужие записи:

```bash
npm run appwrite:invite -- author@example.com "Имя автора"
```

Перенос сохранённой ленты после приглашения первого автора:

```bash
APPWRITE_MIGRATION_AUTHOR_ID=<user-id> npm run appwrite:migrate
```

## Сборка и деплой

Локально проверить экспорт как на Pages:

```bash
STATIC_EXPORT=1 PAGES_BASE_PATH=/smolensk-art-ghpages npm run build
```

Публикация: push в `master` → workflow **Deploy GitHub Pages**. В GitHub
Repository Variables должны быть заданы `NEXT_PUBLIC_APPWRITE_ENDPOINT` и
`NEXT_PUBLIC_APPWRITE_PROJECT_ID`.

## Видео фона

Исходный ролик перекодировать в `public/leaves-wall.mp4`:

```bash
IN=/path/to/запись.mov ./scripts/encode-leaves-wall.sh
```

Лицензия: см. `LICENSE`.
