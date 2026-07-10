const siteVersion = process.env.NEXT_PUBLIC_SITE_VERSION ?? "dev";

export default function Home() {
  return (
    <iframe
      title="Смоленск Арт"
      src={`editorial.html?v=${siteVersion}`}
      className="fixed inset-0 h-dvh w-screen border-0"
      allow="autoplay; fullscreen"
    />
  );
}
