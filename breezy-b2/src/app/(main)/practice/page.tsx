import PracticeTabs from "@/components/practice-tabs";
import { PageHero } from "@/components/page-hero";
import { getPracticeMoves } from "@/lib/knowledge";
import { practiceStretchData, practiceOfficeData } from "@/lib/content-data";

export default function PracticePage({
  searchParams,
}: {
  searchParams?: { tab?: string; move?: string };
}) {
  const moves = getPracticeMoves();

  return (
    <div className="space-y-6">
      <PageHero
        img="/img/banners/practice.jpg"
        title="功法带练"
        subtitle="八段锦 · 疏肝拉伸 · 动静相宜"
      />

      <PracticeTabs
        baduanjin={moves.map((m) => ({ name: m.name }))}
        stretch={practiceStretchData}
        office={practiceOfficeData}
        initialTab={searchParams?.tab}
        initialMove={searchParams?.move}
      />
    </div>
  );
}
