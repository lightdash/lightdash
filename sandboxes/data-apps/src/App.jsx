import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { KpiCards } from './components/KpiCards';
import { ChampionshipProgression } from './components/ChampionshipProgression';
import { DriverStandings } from './components/DriverStandings';
import { ConstructorChart } from './components/ConstructorChart';
import { TeammateBattles } from './components/TeammateBattles';
import { PitStops } from './components/PitStops';

function Header() {
    return (
        <header className="border-b border-zinc-800 bg-zinc-950">
            <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
                <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-red-600 text-xs font-black text-white">
                        F1
                    </div>
                    <div>
                        <h1 className="text-lg font-bold tracking-tight text-zinc-100">
                            Formula 1 Dashboard
                        </h1>
                        <p className="text-xs text-zinc-500">2025 Season</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-800 bg-emerald-950 px-2.5 py-0.5 text-xs text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Live Data
                    </span>
                </div>
            </div>
        </header>
    );
}

function App() {
    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100">
            <Header />

            <main className="mx-auto max-w-7xl px-6 py-6">
                <Tabs defaultValue="championship" className="space-y-6">
                    <TabsList className="bg-zinc-900 border border-zinc-800">
                        <TabsTrigger
                            value="championship"
                            className="data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100"
                        >
                            Championship
                        </TabsTrigger>
                        <TabsTrigger
                            value="teams"
                            className="data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100"
                        >
                            Teams
                        </TabsTrigger>
                        <TabsTrigger
                            value="pitstops"
                            className="data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100"
                        >
                            Pit Stops
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="championship" className="space-y-6">
                        <KpiCards />
                        <ChampionshipProgression />
                        <DriverStandings />
                    </TabsContent>

                    <TabsContent value="teams" className="space-y-6">
                        <ConstructorChart />
                        <TeammateBattles />
                    </TabsContent>

                    <TabsContent value="pitstops" className="space-y-6">
                        <PitStops />
                    </TabsContent>
                </Tabs>
            </main>
        </div>
    );
}

export default App;
