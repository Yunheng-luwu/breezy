import { AcupointGrid } from "@/components/acupoint-grid";
import { CareTabs } from "@/components/care-tabs";
import { FootbathSection, type Footbath } from "@/components/footbath-section";
import { PageHero } from "@/components/page-hero";
import { bannerSets } from "@/lib/data/banners";
import { acupoints } from "@/lib/data/acupoints";
import { dietData } from "@/lib/data/diet";
import { currentUserId, getFavorites } from "@/lib/queries";

export const dynamic = "force-dynamic";

const footbaths = (dietData.footbaths ?? []) as Footbath[];

export default async function CarePage({
  searchParams,
}: {
  searchParams?: { acupoint?: string };
}) {
  const userId = await currentUserId();
  const favorites = await getFavorites(userId);
  const acuFavs = favorites
    .filter((f) => f.favType === "acupoint")
    .map((f) => f.targetName);
  const bathFavs = favorites
    .filter((f) => f.favType === "footbath")
    .map((f) => f.targetName);

  return (
    <div className="space-y-10">
      <PageHero
        imgs={bannerSets.care}
        title="居家保健"
        subtitle="泡脚助眠 · 穴位疏通 · 草本调理"
      />

      {/* 穴位疏通 / 泡脚助眠（页签切换，对齐冻结版布局） */}
      <CareTabs
        initialTab={searchParams?.acupoint ? "acupoint" : undefined}
        acupoint={
          <AcupointGrid
            acupoints={acupoints}
            favorites={acuFavs}
            initialAcupoint={searchParams?.acupoint}
          />
        }
        footbath={<FootbathSection footbaths={footbaths} favorites={bathFavs} />}
      />
    </div>
  );
}
