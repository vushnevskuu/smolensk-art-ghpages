import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = JSON.parse(
  readFileSync(join(root, "src/data/content-source.json"), "utf8"),
);

/* Легаси: подстановка русских текстов для старого набора постов в thoughts */
const t = src.thoughts ?? [];
if (t[0]) {
  t[0].html =
    "Привет! На компьютере: [D] — день, [S] — лето (листва), [N] — ночь, [M] — полночь, [R] — дождь.\n\n❤️";
}
if (t[1]) {
  t[1].html =
    "Десятилетний я подумал бы, что я крут. Для меня важно только это.";
}
if (t[2]) {
  t[2].html =
    "Ты не выгорел.\nТы зависим.\n\nНе от работы.\nОт стимуляции.\n\nТы не устал.\nТебе не «не хватает фокуса».\nТы просто тренируешь отвлечение.\nКаждую минуту бодрствования.\n\nЛистаешь. Проверяешь. Тыкаешь. Свайпаешь.\nСнова. Снова. Снова.\n\nПоэтому, когда пусто, мозг решает, что что-то не так.\n\nПосиди в тишине 15 минут.\n\nБез телефона.\nБез музыки.\nБез стимуляции.\n\nЕсли станет тревожно, непривычно, раздражающе —\n\nхорошо.\n\nЭто не провал.\n\nЭто абстиненция.";
}
if (t[3]) {
  t[3].text =
    "Моя система управления контентом в Telegram уже работает.";
}

const ruCap = {
  "logo and icon set for Die Carz": "Логотип и набор иконок для Die Carz",
  "spotted on berlin streets today": "Заметил сегодня на улицах Берлина",
  "logo for tokalon (discontinued startup i was working on)":
    "Логотип для Tokalon (закрытый стартап, над которым я работал)",
  "design concepts for note taking app ✳︎Poi":
    "Концепты приложения для заметок ✳︎Poi",
  "Porsche B32. I am not joking.": "Porsche B32. Без шуток.",
  "miniature life": "Миниатюрная жизнь",
  "Lancia Sibilo 1970s": "Lancia Sibilo, 1970-е",
  "Die Carz \nmicrographics": "Die Carz\nмикрографика",
  "Lamborghini Miura 70s": "Lamborghini Miura, 1970-е",
  "Lamborghini Marzal. Matchbox. 1972":
    "Lamborghini Marzal. Matchbox. 1972",
};

function mapCaption(s) {
  if (s == null) return s;
  return ruCap[s] ?? s;
}

for (const img of src.images ?? []) {
  if (img.captionHtml) img.captionHtml = mapCaption(img.captionHtml);
  if (img.caption) img.caption = mapCaption(img.caption);
  if (img.images) {
    for (const sub of img.images) {
      if (sub.captionHtml) sub.captionHtml = mapCaption(sub.captionHtml);
    }
  }
}

const voice = src.images?.find((i) => i.type === "voice");
if (voice?.transcript) {
  voice.transcriptText =
    " Привет всем! Добро пожаловать на мой личный сайт. Здесь подборка моих проектов, идей, концептов, а также мыслей.";
  const words = [
    "Привет",
    "всем!",
    "Добро",
    "пожаловать",
    "на",
    "мой",
    "личный",
    "сайт.",
    "Здесь",
    "подборка",
    "моих",
    "проектов,",
    "идей",
    "концептов,",
    "а",
    "также",
    "мыслей.",
  ];
  voice.transcript = voice.transcript.map((tr, i) => ({
    ...tr,
    word: words[i] ?? tr.word,
  }));
}

writeFileSync(
  join(root, "src/data/content-ru.json"),
  JSON.stringify(src, null, 2) + "\n",
  "utf8",
);
console.log("Wrote src/data/content-ru.json");
