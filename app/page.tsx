import Analyzer from "@/components/Analyzer";
import Landing from "@/components/Landing";

export default function Home() {
  return (
    <main className="flex-1">
      <Landing />
      <div className="border-t border-line">
        <Analyzer />
      </div>
      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-10 text-sm text-muted sm:px-6">
          <span className="display text-base text-fg">Almost</span>
          <span>Shelf intelligence from the CCTV you already have · Hackathon MVP</span>
        </div>
      </footer>
    </main>
  );
}
