import Link from "next/link";

function RadarMark() {
  return (
    <div className="relative flex h-40 w-40 shrink-0 items-center justify-center sm:h-48 sm:w-48">
      <span className="absolute inline-flex h-full w-full rounded-full border border-signal/20" />
      <span className="absolute inline-flex h-2/3 w-2/3 rounded-full border border-signal/25" />
      <span className="absolute inline-flex h-1/3 w-1/3 rounded-full border border-signal/30" />
      <span className="absolute h-full w-full animate-pulseRing rounded-full border border-signal/40" />
      <div className="absolute h-full w-full animate-sweep [transform-origin:50%_50%]">
        <div className="h-1/2 w-full origin-bottom bg-gradient-to-t from-signal/25 to-transparent" style={{ clipPath: "polygon(50% 100%, 0% 0%, 100% 0%)" }} />
      </div>
      <span className="relative h-2.5 w-2.5 rounded-full bg-signal shadow-[0_0_16px_2px_rgba(110,242,166,0.6)]" />
    </div>
  );
}

const options = [
  {
    href: "/create-room",
    title: "Make room",
    description: "Create a room and get a short code. Anyone who enters it can join and share files with everyone else inside.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M12 3v12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        <path d="M7 8l5-5 5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/join-room",
    title: "Join room",
    description: "Have a code from someone else? Enter it to connect straight to their room, wherever they are.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M12 21V9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        <path d="M7 14l5 5 5-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4 5v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/same-wifi",
    title: "Same WiFi",
    description: "Skip the code entirely. Devices on the same local network can find each other directly.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M4 9c4.5-4 11.5-4 16 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        <path d="M7.5 12.8c2.6-2.3 6.4-2.3 9 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        <path d="M11 16.6c.9-.8 2.1-.8 3 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        <circle cx="12.5" cy="19.5" r="1.1" fill="currentColor" />
      </svg>
    ),
  },
];

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col px-6 py-14 sm:px-10">
      <header className="flex items-center justify-between">
        <span className="font-display text-lg tracking-tight text-ink">FileSync</span>
        <span className="hidden text-xs text-muted sm:block">Direct device-to-device transfer</span>
      </header>

      <section className="mt-12 flex flex-col items-start gap-10 sm:mt-20 sm:flex-row sm:items-center sm:gap-14">
        <div className="max-w-xl">
          <h1 className="font-display text-4xl leading-[1.08] tracking-tight text-ink sm:text-5xl">
            Send anything, straight to another screen.
          </h1>
          <p className="mt-5 max-w-md text-base leading-relaxed text-muted">
            No accounts, no size games, no uploading to a stranger&apos;s server. Open a room, share the code, and files
            move directly between your devices — across rooms, across networks.
          </p>
        </div>
        <RadarMark />
      </section>

      <section className="mt-14 grid gap-4 sm:mt-16 sm:grid-cols-3">
        {options.map((opt) => (
          <Link
            key={opt.href}
            href={opt.href}
            className="group flex flex-col justify-between rounded-xl border border-hairline bg-surface/60 p-6 transition-colors hover:border-transfer/40 hover:bg-surface"
          >
            <div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-transfer/10 text-transfer">{opt.icon}</div>
              <h2 className="mt-4 font-display text-lg text-ink">{opt.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">{opt.description}</p>
            </div>
            <span className="mt-6 text-sm font-medium text-transfer opacity-80 transition-opacity group-hover:opacity-100">
              Open
            </span>
          </Link>
        ))}
      </section>

      <footer className="mt-auto pt-16 text-xs text-muted">
        Files transfer peer-to-peer over WebRTC. The server only helps devices find each other — it never stores your files.
      </footer>
    </main>
  );
}
