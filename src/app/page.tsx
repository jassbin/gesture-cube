import { CubeStage } from "@/components/cube/cube-stage";
import { BottomNav } from "@/components/shell/bottom-nav";
import { LocaleToggle } from "@/components/shell/locale-toggle";

export default function Home() {
  return (
    <main className="relative h-dvh w-full overflow-hidden">
      <CubeStage />
      {/* locale toggle floats top-center over the stage, clear of HUD clusters */}
      <div
        className="fixed left-1/2 z-40 -translate-x-1/2"
        style={{ top: "max(56px, env(safe-area-inset-top, 0px))" }}
      >
        <LocaleToggle />
      </div>
      <BottomNav />
    </main>
  );
}
