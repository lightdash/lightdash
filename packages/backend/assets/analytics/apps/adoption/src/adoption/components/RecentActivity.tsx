import { ArrowDown } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
    bucketCells,
    countActive,
    countByKind,
    formatCount,
    formatDay,
    formatDaysAgo,
    formatPeople,
    formatShare,
    KIND_LABELS,
    KIND_ORDER,
    kindOf,
    markAttr,
    type MarkKind,
    type Organisation,
    type TeamBucket,
} from '../model';
import { sweepProps, wipeProps, type FollowSweep } from '../map/colourTransition';

type Props = {
    organisation: Organisation;
    selectedId: string | null;
    onOpen: (teamId: string) => void;
    // An open team whose people are known by name: the rows become its people
    focus: TeamBucket | null;
    // What the bars and dots are split by
    mode: 'activity' | 'role';
    // While the colouring changes, the marks populate with the map's sweep
    sweep: FollowSweep | null;
};

// About how tall the rows are, for working out when the sweep reaches each
const HEADER_PX = 40;
const TEAM_ROW_PX = 48;
const PERSON_ROW_PX = 32;
// Where along the card's width the team bars start and end
const BAR_FROM = 0.2;
const BAR_TO = 0.85;

type RowData = { id: string; name: string; people: number; counts: Map<MarkKind, number>; active: number; isNoTeam: boolean };
type PersonRow = { id: string; name: string; kind: MarkKind; lastActive: string | null; activeDays: number };

// Teams down the side, one bar each split by how recently people were last active, or by role. The colours are the
// legend's. With a team open the rows are its people: their recency or role, when each was last active, and on how
// many of the last 30 days.
export const RecentActivity = ({ organisation, selectedId, onOpen, focus, mode, sweep }: Props) => {
    const kinds = KIND_ORDER[mode];
    const labels = KIND_LABELS[mode];
    // false sorts by team size, true by the share active in the last 30 days
    const [byActive, setByActive] = useState(false);
    const peopleRows = useMemo<PersonRow[] | null>(() => {
        if (focus === null) return null;
        const built = focus.items.flatMap(({ cell }) =>
            cell.person
                ? [{ id: cell.person.id, name: cell.person.name, kind: kindOf(cell, mode), lastActive: cell.person.lastActive, activeDays: cell.person.activeDays }]
                : [],
        );
        // By role in the legend's order, or most recent first with people never seen last
        return built.sort((a, b) =>
            mode === 'role'
                ? kinds.indexOf(a.kind) - kinds.indexOf(b.kind) || a.name.localeCompare(b.name)
                : (b.lastActive ?? '').localeCompare(a.lastActive ?? '') || a.name.localeCompare(b.name),
        );
    }, [focus, mode, kinds]);
    const rows = useMemo<RowData[]>(() => {
        const built = organisation.buckets.map((bucket) => {
            const cells = bucketCells(bucket);
            return {
                id: bucket.team.id,
                name: bucket.team.name,
                people: bucket.people,
                counts: countByKind(cells, mode),
                active: countActive(cells),
                isNoTeam: bucket.isNoTeam,
            };
        });
        if (!byActive || mode !== 'activity') return built;
        const share = (row: RowData) => (row.people > 0 ? row.active / row.people : 0);
        return [...built].sort((a, b) => share(b) - share(a) || b.people - a.people);
    }, [organisation, byActive, mode]);
    const everyone = useMemo<RowData>(
        () => ({
            id: 'everyone',
            name: 'Everyone',
            people: organisation.total,
            counts: countByKind(organisation.cells, mode),
            active: countActive(organisation.cells),
            isNoTeam: false,
        }),
        [organisation, mode],
    );

    if ((peopleRows ?? rows).length === 0) return <p className="p-6 text-sm text-muted-foreground">There is nobody to show yet.</p>;

    if (peopleRows) {
        // People are grouped under one heading, said once: the day they were last active, or their role. A row is then
        // just the person and how many of the last 30 days they were active, as a small bar.
        const columns = `grid ${mode === 'role' ? 'grid-cols-[minmax(120px,220px)_minmax(0,1fr)_150px]' : 'grid-cols-[minmax(0,1fr)_150px]'} items-center gap-x-4`;
        const groups: { key: string; kind: (typeof peopleRows)[number]['kind']; title: string; note: string; people: typeof peopleRows }[] = [];
        peopleRows.forEach((person) => {
            const key = mode === 'role' ? String(person.kind) : (person.lastActive ?? 'never');
            const last = groups[groups.length - 1];
            if (last && last.key === key) last.people.push(person);
            else
                groups.push({
                    key,
                    kind: person.kind,
                    title: mode === 'role' ? labels[person.kind] : formatDaysAgo(person.lastActive),
                    note: mode === 'role' || person.lastActive === null ? '' : formatDay(person.lastActive),
                    people: [person],
                });
        });
        let row = 0;
        return (
            <div className="max-h-[max(220px,30vh)] overflow-y-auto px-4 pb-3">
                <div className={`${columns} sticky top-0 z-10 bg-card py-2 text-xs text-muted-foreground`}>
                    <span>{mode === 'role' ? 'Role and person' : 'Last active and person'}</span>
                    {mode === 'role' && <span>Last active</span>}
                    <span title="Days active in the last 30 days">Days active, last 30</span>
                </div>
                {groups.map((group) => (
                    <section key={group.key} className="pb-2">
                        <h3 className="m-0 flex items-center gap-2 py-1.5 text-sm font-semibold">
                            <span className="ad-mark inline-block h-3 w-3 shrink-0 rounded-full" data-kind={markAttr(mode, group.kind)} />
                            {group.title}
                            <span className="ad-count font-normal text-muted-foreground">
                                {group.note ? `${group.note} · ` : ''}
                                {formatPeople(group.people.length)}
                            </span>
                        </h3>
                        {group.people.map((person) => {
                            const y = HEADER_PX + (row += 1) * PERSON_ROW_PX;
                            return (
                                <div key={person.id} className={`${columns} rounded py-1 pl-5 hover:bg-muted/50`}>
                                    <span className="truncate text-sm">{person.name}</span>
                                    {mode === 'role' && (
                                        <span className="ad-count text-sm text-muted-foreground" title={person.lastActive ? formatDay(person.lastActive) : undefined} {...sweepProps(sweep, 0.6, y)}>
                                            {formatDaysAgo(person.lastActive)}
                                        </span>
                                    )}
                                    <span className="flex items-center gap-2" title={`Active on ${person.activeDays} of the last 30 days`} {...sweepProps(sweep, 0.95, y)}>
                                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                                            <span className="ad-ink block h-full rounded-full" style={{ width: `${Math.min(person.activeDays / 30, 1) * 100}%` }} />
                                        </span>
                                        <span className="ad-count w-5 text-right text-sm">{person.activeDays}</span>
                                    </span>
                                </div>
                            );
                        })}
                    </section>
                ))}
            </div>
        );
    }

    // The whole bar is wiped in by the sweep as one piece, which sits in the middle of the row's width
    const bar = (row: RowData, rowIndex: number) => (
        <div
            className="flex h-6 w-full overflow-hidden rounded"
            role="img"
            aria-label={`${row.name}: ${kinds.map((kind) => `${formatCount(row.counts.get(kind) ?? 0)} ${labels[kind].toLowerCase()}`).join(', ')}`}
            {...wipeProps(sweep, BAR_FROM, BAR_TO, HEADER_PX + rowIndex * TEAM_ROW_PX)}
        >
            {kinds.map((kind) => {
                const count = row.counts.get(kind) ?? 0;
                return count > 0 ? (
                    <span
                        key={kind}
                        className="ad-mark"
                        data-kind={markAttr(mode, kind)}
                        style={{ flex: `${count} 1 0` }}
                        title={`${labels[kind]}: ${formatCount(count)} of ${formatCount(row.people)} people`}
                    />
                ) : null;
            })}
        </div>
    );

    return (
        <div className="max-h-[max(220px,30vh)] overflow-y-auto px-4 pb-3">
            <div className="sticky top-0 z-10 grid grid-cols-[minmax(120px,220px)_minmax(0,1fr)_96px] items-end gap-x-4 bg-card py-2 text-xs text-muted-foreground">
                <span>Team</span>
                <span>{mode === 'role' ? 'Roles' : 'Last active'}</span>
                {mode === 'activity' ? (
                    <button
                        type="button"
                        className="inline-flex items-center justify-end gap-1 hover:text-foreground"
                        aria-pressed={byActive}
                        title="Order teams by the share active in the last 30 days"
                        onClick={() => setByActive(!byActive)}
                    >
                        <span className={byActive ? 'text-foreground' : undefined}>Active in 30 days</span>
                        {byActive && <ArrowDown className="h-3 w-3 text-foreground" />}
                    </button>
                ) : (
                    <span />
                )}
            </div>
            {[everyone, ...rows].map((row, index) => (
                <div
                    key={row.id}
                    className={`grid grid-cols-[minmax(120px,220px)_minmax(0,1fr)_96px] items-center gap-x-4 rounded py-1.5 ${index === 0 ? 'mb-1 border-b pb-2' : ''} ${selectedId === row.id ? 'bg-muted' : ''}`}
                >
                    {index === 0 ? (
                        <div className="min-w-0">
                            <div className="font-semibold">{row.name}</div>
                            <div className="ad-count text-xs text-muted-foreground">{formatCount(row.people)} people</div>
                        </div>
                    ) : (
                        <button type="button" className="block min-w-0 text-left hover:underline" onClick={() => onOpen(row.id)}>
                            <span className={`block truncate font-medium ${row.isNoTeam ? 'italic' : ''}`}>{row.name}</span>
                            <span className="ad-count block text-xs text-muted-foreground">{formatCount(row.people)} people</span>
                        </button>
                    )}
                    {bar(row, index)}
                    <div className="ad-count text-right text-sm" title={mode === 'activity' ? `${formatCount(row.active)} of ${formatCount(row.people)} people` : undefined}>
                        {mode === 'activity' ? formatShare(row.active, row.people) : null}
                    </div>
                </div>
            ))}
        </div>
    );
};
