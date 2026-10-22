import Analyzer from "@/components/Analyzer";
import HowItWorks from "@/components/HowItWorks";

export default function Home() {
  return (
    <main className="flex-1">
      <HowItWorks />
      <div className="border-t border-zinc-200 dark:border-zinc-800">
        <Analyzer />
      </div>
      <footer className="mx-auto w-full max-w-5xl px-4 pb-10 text-sm text-zinc-500 sm:px-6">
        Almost · hackathon MVP
      </footer>
    </main>
  );
}
