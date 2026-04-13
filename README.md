# Смоленск Арт

Статический сайт сообщества: лента постов, фон «Солнечный день», деплой на **GitHub Pages**.

**Онлайн:** [vushnevskuu.github.io/smolensk-art-ghpages](https://vushnevskuu.github.io/smolensk-art-ghpages/)

## Разработка

```bash
npm install
npm run dev
```

Контент: `src/data/content-ru.json` (перед `dev`/`build` копируется в `public/content.json`).

## Сборка и деплой

Локально проверить экспорт как на Pages:

```bash
STATIC_EXPORT=1 PAGES_BASE_PATH=/smolensk-art-ghpages npm run build
```

Публикация: push в `master` → workflow **Deploy GitHub Pages** (см. `.github/workflows/deploy-pages.yml`).

## Видео фона

Исходный ролик перекодировать в `public/leaves-wall.mp4`:

```bash
IN=/path/to/запись.mov ./scripts/encode-leaves-wall.sh
```

Лицензия: см. `LICENSE`.
