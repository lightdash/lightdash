import { ChevronDown, ChevronRight } from 'lucide-react';
import { useMemo } from 'react';
import { bucketCells, formatCount, formatShare, popcount, usageOf, type Cell, type ColourBy, type Organisation } from '../model';

// Where an admin might spend effort, as an expandable section under the detail. Three fixed areas, each a list of
// the teams with that problem, worst first: poor feature adoption, inactivity and falling activity. An area with no
// team in it is left out. Each list shows its top three and scrolls for the rest.

const SMALLEST_TEAM = 3;
// Using this many features or fewer is "only a little"
const FEW_FEATURES = 2;

type TeamFacts = { id: string; name: string; people: number; active: number; cells: Cell[] };
// What a team scores on an area, or null when the team does not belong in it
type Score = { count: number; of: number; text: string };
// What the drawing above shows when a team is picked from the area, so the reason it stood out can be seen
export type FocusView = { colourBy: ColourBy };
type AreaSpec = {
    key: string;
    title: string;
    hint: string;
    // Teams are ranked by how many people, or by what share of them
    by: 'count' | 'share';
    view: FocusView;
    score: (team: TeamFacts) => Score | null;
};

const isActive = (cell: Cell) => cell.recency === 'd7' || cell.recency === 'd30';
const sum = (cells: Cell[], keep: (cell: Cell) => boolean) => cells.reduce((total, cell) => total + (keep(cell) ? cell.count : 0), 0);

const AREAS: AreaSpec[] = [
    {
        key: 'shallow',
        title: 'Poor feature adoption',
        hint: `Teams where the most active people use ${FEW_FEATURES} features or fewer.`,
        by: 'count',
        view: { colourBy: 'usage' },
        score: (team) => {
            const shallow = sum(team.cells, (cell) => isActive(cell) && popcount(cell.parts) <= FEW_FEATURES);
            return team.active >= SMALLEST_TEAM && shallow / team.active >= 0.4
                ? { count: shallow, of: team.active, text: `${formatCount(shallow)} of ${formatCount(team.active)} active people use ${FEW_FEATURES} features or fewer` }
                : null;
        },
    },
    {
        key: 'idle',
        title: 'Inactive',
        hint: 'Teams with the most people without recorded activity in the last 30 days.',
        by: 'count',
        view: { colourBy: 'activity' },
        score: (team) => {
            const idle = sum(team.cells, (cell) => ['left', 'never'].includes(usageOf(cell)));
            return idle > 0 && idle / team.people >= 0.25 ? { count: idle, of: team.people, text: `${formatCount(idle)} of ${formatCount(team.people)} not active in 30 days` } : null;
        },
    },
    {
        key: 'dropped',
        title: 'Falling activity',
        hint: 'Teams that lost the most people: active in the four weeks before, but not in the last four.',
        by: 'count',
        view: { colourBy: 'growth' },
        score: (team) => {
            const dropped = sum(team.cells, (cell) => cell.flow === 'dropped');
            return dropped > 0 ? { count: dropped, of: team.people, text: `${formatCount(dropped)} of ${formatCount(team.people)} dropped in four weeks` } : null;
        },
    },
];

type Entry = Score & { id: string; name: string };

const rank = (area: AreaSpec, teams: TeamFacts[]): Entry[] =>
    teams
        .flatMap((team) => {
            const score = area.score(team);
            return score ? [{ ...score, id: team.id, name: team.name }] : [];
        })
        .sort((a, b) => (area.by === 'share' ? b.count / b.of - a.count / a.of || b.count - a.count : b.count - a.count || b.count / b.of - a.count / a.of));

type Props = {
    organisation: Organisation;
    isOpen: boolean;
    onToggle: () => void;
    onPick: (teamId: string, view: FocusView) => void;
};

export const FocusAreas = ({ organisation, isOpen, onToggle, onPick }: Props) => {
    const areas = useMemo(() => {
        const teams: TeamFacts[] = organisation.buckets
            .filter((bucket) => !bucket.isNoTeam && bucket.people >= SMALLEST_TEAM)
            .map((bucket) => {
                const cells = bucketCells(bucket);
                return { id: bucket.team.id, name: bucket.team.name, people: bucket.people, active: sum(cells, isActive), cells };
            });
        // An area nobody is in is not a problem, so it is not shown
        return AREAS.map((area) => ({ area, entries: rank(area, teams) })).filter((each) => each.entries.length > 0);
    }, [organisation]);
    if (areas.length === 0) return null;
    return (
        <div className="min-w-0 overflow-hidden rounded-lg border bg-card">
            <div className="flex items-center">
                <h2 className="m-0 min-w-0 flex-1 text-sm font-semibold">
                    <button type="button" className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-muted/50" aria-expanded={isOpen} onClick={onToggle}>
                        {isOpen ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                        Focus areas
                    </button>
                </h2>
            </div>
            {isOpen && (
                <div className="grid gap-x-8 gap-y-4 border-t px-4 py-3 md:grid-cols-3">
                    {areas.map(({ area, entries }) => (
                        <section key={area.key} className="min-w-0">
                            <h3 className="m-0 flex items-baseline justify-between pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground" title={area.hint}>
                                {area.title}
                                <span className="ad-count font-normal normal-case tracking-normal">{entries.length === 1 ? '1 team' : `${formatCount(entries.length)} teams`}</span>
                            </h3>
                            {/* Room for three teams; the rest are a scroll away */}
                            <div className="max-h-[150px] overflow-y-auto">
                                {entries.map((entry) => (
                                    <button
                                        key={entry.id}
                                        type="button"
                                        className="flex h-[50px] w-full items-center justify-between gap-3 rounded px-1.5 text-left hover:bg-muted/50"
                                        title={`${entry.name}: ${entry.text}`}
                                        onClick={() => onPick(entry.id, area.view)}
                                    >
                                        <span className="min-w-0">
                                            <span className="block truncate text-sm font-medium">{entry.name}</span>
                                            <span className="ad-count block truncate text-xs text-muted-foreground">{entry.text}</span>
                                        </span>
                                        <span className="ad-count shrink-0 text-sm font-semibold">{formatShare(entry.count, entry.of)}</span>
                                    </button>
                                ))}
                            </div>
                        </section>
                    ))}
                </div>
            )}
        </div>
    );
};
