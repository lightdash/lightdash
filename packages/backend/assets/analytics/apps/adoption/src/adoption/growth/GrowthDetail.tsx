import { useMemo } from 'react';
import { DotSwatch } from '../components/Legend';
import {
    bucketCells,
    formatCount,
    formatDay,
    formatPeople,
    KIND_LABELS,
    markAttr,
    summariseFlow,
    type FlowKind,
    type FlowSummary,
    type Organisation,
    type TeamBucket,
} from '../model';
import './growth.css';

// Under the drawing when it is coloured by Growth: for everyone and for each team, the people gained and lost between
// the four weeks before and the last four weeks. With a team open and its people known by name, the people themselves.

const signed = (value: number): string => (value > 0 ? `+${formatCount(value)}` : value < 0 ? `−${formatCount(-value)}` : '0');

// People gained for each one lost, the "quick ratio"
const formatRatio = (summary: FlowSummary): string => {
    if (summary.ratio === null) return summary.gained > 0 ? 'None lost' : '–';
    return summary.ratio >= 10 ? summary.ratio.toFixed(0) : summary.ratio.toFixed(1);
};

const describe = (summary: FlowSummary): string =>
    `${formatCount(summary.counts.new)} new, ${formatCount(summary.counts.back)} returned, ${formatCount(summary.counts.dropped)} dropped, ${formatCount(summary.counts.stayed)} stayed, of ${formatPeople(summary.people)}`;

const COLUMNS = 'grid grid-cols-[minmax(120px,220px)_64px_minmax(0,1fr)_64px_64px_64px_84px] items-center gap-x-4';
const PERSON_COLUMNS = 'grid grid-cols-[minmax(120px,220px)_minmax(0,1fr)_120px_140px] items-center gap-x-4';
// People to act on first
const PERSON_ORDER: FlowKind[] = ['dropped', 'new', 'back', 'stayed', 'lapsed', 'never'];

type Props = {
    organisation: Organisation;
    selectedId: string | null;
    onOpen: (teamId: string) => void;
    // The team that is open, once its people are known by name
    focus: TeamBucket | null;
};

export const GrowthDetail = ({ organisation, selectedId, onOpen, focus }: Props) => {
    const everyone = useMemo(() => summariseFlow(organisation.cells), [organisation]);
    const rows = useMemo(
        () =>
            organisation.buckets
                .map((bucket) => ({ id: bucket.team.id, name: bucket.team.name, isNoTeam: bucket.isNoTeam, summary: summariseFlow(bucketCells(bucket)) }))
                // Biggest net falls first, so the top of the list is where to look
                .sort((a, b) => a.summary.net - b.summary.net || b.summary.lost - a.summary.lost || b.summary.people - a.summary.people),
        [organisation],
    );
    const people = useMemo(
        () =>
            focus === null
                ? null
                : focus.items
                      .flatMap(({ cell }) => (cell.person ? [{ ...cell.person, flow: cell.flow }] : []))
                      .sort((a, b) => PERSON_ORDER.indexOf(a.flow) - PERSON_ORDER.indexOf(b.flow) || a.name.localeCompare(b.name)),
        [focus],
    );
    // One scale for every team, in people: a bar is as long as the number gained or lost, so a team that lost 79 has
    // a longer bar than one that lost 11, whatever their sizes. Everyone would dwarf every team on that scale, so
    // that row's bar is on a scale of its own: it shows the split between lost and gained, not a length to compare.
    const widest = Math.max(...rows.map((row) => Math.max(row.summary.gained, row.summary.lost)), 1);

    if (organisation.total === 0) return <p className="p-6 text-sm text-muted-foreground">There is nobody to show yet.</p>;

    if (people) {
        return (
            <div className="max-h-[max(220px,30vh)] overflow-y-auto px-4 pb-3">
                <div className={`${PERSON_COLUMNS} sticky top-0 z-10 bg-card py-2 text-xs text-muted-foreground`}>
                    <span>Person</span>
                    <span>Status</span>
                    <span className="text-right">Last seen</span>
                    <span className="text-right" title="Days active in the last 30 days">Days active, last 30</span>
                </div>
                {people.map((person) => (
                    <div key={person.id} className={`${PERSON_COLUMNS} rounded py-1.5 hover:bg-muted/50`}>
                        <span className="truncate font-medium">{person.name}</span>
                        <span className="flex items-center gap-2 text-sm">
                            <DotSwatch colourBy="growth" kind={person.flow} />
                            {KIND_LABELS.growth[person.flow]}
                        </span>
                        <span className="ad-count text-right text-sm text-muted-foreground">{formatDay(person.lastActive)}</span>
                        <span className="ad-count text-right text-sm">{person.activeDays}</span>
                    </div>
                ))}
            </div>
        );
    }

    const bar = (name: string, summary: FlowSummary, scale: number = widest) => {
        const share = (count: number) => `${(count / Math.max(scale, 1)) * 100}%`;
        return (
            <div className="ad-flow-bar" role="img" aria-label={`${name}: ${describe(summary)}`} title={describe(summary)}>
                <span>{summary.counts.dropped > 0 && <i className="ad-mark" data-kind={markAttr('growth', 'dropped')} style={{ width: share(summary.counts.dropped) }} />}</span>
                <span className="ad-flow-axis" />
                <span>
                    {(['new', 'back'] as const).map((kind) =>
                        summary.counts[kind] > 0 ? <i key={kind} className="ad-mark" data-kind={markAttr('growth', kind)} style={{ width: share(summary.counts[kind]) }} /> : null,
                    )}
                </span>
            </div>
        );
    };
    const figures = (summary: FlowSummary) => (
        <>
            <span className="ad-count text-right text-sm">{summary.lost > 0 ? `−${formatCount(summary.lost)}` : '0'}</span>
            <span className="ad-count text-right text-sm">{summary.gained > 0 ? `+${formatCount(summary.gained)}` : '0'}</span>
            <span className={`ad-count text-right text-sm ${summary.net < 0 ? 'font-semibold' : ''}`}>{signed(summary.net)}</span>
            <span className="ad-count text-right text-sm text-muted-foreground">{formatRatio(summary)}</span>
        </>
    );

    return (
        <div className="max-h-[max(220px,30vh)] overflow-y-auto px-4 pb-3">
            <div className={`${COLUMNS} sticky top-0 z-10 bg-card py-2 text-xs text-muted-foreground`}>
                <span>Team</span>
                <span className="text-right">People</span>
                <span className="grid grid-cols-2">
                    <span className="pr-2 text-right">Dropped</span>
                    <span className="pl-2">New and returned</span>
                </span>
                <span className="text-right">Lost</span>
                <span className="text-right">Gained</span>
                <span className="text-right">Net</span>
                <span className="text-right" title="People gained for each one lost. Above 1 the team is growing, below 1 it is shrinking.">
                    Gained per lost
                </span>
            </div>
            <div className={`${COLUMNS} mb-1 rounded border-b py-1.5 pb-2`}>
                <span className="font-semibold">Everyone</span>
                <span className="ad-count text-right text-sm">{formatCount(everyone.people)}</span>
                {bar('Everyone', everyone, Math.max(everyone.gained, everyone.lost))}
                {figures(everyone)}
            </div>
            {rows.map((row) => (
                <div key={row.id} className={`${COLUMNS} rounded py-1.5 ${selectedId === row.id ? 'bg-muted' : ''}`}>
                    <button type="button" className="block min-w-0 text-left hover:underline" onClick={() => onOpen(row.id)}>
                        <span className={`block truncate font-medium ${row.isNoTeam ? 'italic' : ''}`}>{row.name}</span>
                    </button>
                    <span className="ad-count text-right text-sm text-muted-foreground">{formatCount(row.summary.people)}</span>
                    {bar(row.name, row.summary)}
                    {figures(row.summary)}
                </div>
            ))}
        </div>
    );
};
