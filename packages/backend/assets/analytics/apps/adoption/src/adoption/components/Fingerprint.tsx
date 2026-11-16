import { ArrowDown, Check, ChevronDown, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { sweepProps, type FollowSweep } from '../map/colourTransition';
import { bucketCells, countByPart, formatCount, formatShare, hasPart, PARTS, popcount, type Organisation, type TeamBucket } from '../model';

type Props = {
    organisation: Organisation;
    selectedId: string | null;
    selectedPart: number | null;
    // The features to show a column for, one bit each in the order of PARTS
    shownParts: number;
    onOpen: (teamId: string, part: number | null) => void;
    // An open team whose people are known by name: the rows become its people
    focus: TeamBucket | null;
    // While the colouring changes, the cells populate with the map's sweep
    sweep: FollowSweep | null;
};

// About how tall the rows are, for working out when the sweep reaches each cell
const HEADER_PX = 40;
const EVERYONE_ROW_PX = 56;
const ROW_PX = 44;
// The cells start after the name column
const CELLS_FROM = 0.2;

type RowData = { id: string; name: string; people: number; parts: number[]; isNoTeam: boolean };
type PersonRow = { id: string; name: string; parts: number };

// Teams down the side, parts of Lightdash across the top. Each cell is the share of the team that used that part in
// the last 30 days. A column heading ranks teams on that part; a cell opens the people behind it.
// With a team open the rows are its people, and each cell shows whether that person used the part.
export const Fingerprint = ({ organisation, selectedId, selectedPart, shownParts, onOpen, focus, sweep }: Props) => {
    const isShown = (index: number) => hasPart(shownParts, index);
    const cellSweep = (partIndex: number, rowIndex: number) =>
        sweepProps(sweep, CELLS_FROM + ((1 - CELLS_FROM) * (partIndex + 0.5)) / PARTS.length, HEADER_PX + EVERYONE_ROW_PX + rowIndex * ROW_PX);
    // null sorts by team size, a number by that part's share
    const [sortPart, setSortPart] = useState<number | null>(null);
    const [arePeopleShown, setArePeopleShown] = useState(true);
    const peopleRows = useMemo<PersonRow[] | null>(() => {
        if (focus === null) return null;
        const built = focus.items.flatMap(({ cell }) => (cell.person ? [{ id: cell.person.id, name: cell.person.name, parts: cell.parts }] : []));
        return built.sort(
            (a, b) =>
                (sortPart === null ? 0 : Number(hasPart(b.parts, sortPart)) - Number(hasPart(a.parts, sortPart))) ||
                popcount(b.parts) - popcount(a.parts) ||
                a.name.localeCompare(b.name),
        );
    }, [focus, sortPart]);
    const rows = useMemo<RowData[]>(() => {
        const built = organisation.buckets.map((bucket) => ({
            id: bucket.team.id,
            name: bucket.team.name,
            people: bucket.people,
            parts: countByPart(bucketCells(bucket)),
            isNoTeam: bucket.isNoTeam,
        }));
        if (sortPart === null) return built;
        const share = (row: RowData) => (row.people > 0 ? row.parts[sortPart] / row.people : 0);
        return [...built].sort((a, b) => share(b) - share(a) || b.people - a.people);
    }, [organisation, sortPart]);
    const everyone = useMemo(() => countByPart(organisation.cells), [organisation]);

    if ((peopleRows ?? rows).length === 0) {
        return <p className="p-6 text-sm text-muted-foreground">There is nobody to show yet.</p>;
    }
    const noun = peopleRows ? 'people' : 'teams';
    // The line under the top row is there to part it from rows below, so it goes when the people are folded away
    const divider = (peopleRows ? arePeopleShown && peopleRows.length > 0 : rows.length > 0) ? 'border-b' : '';
    return (
        <div className="max-h-[max(220px,30vh)] overflow-x-auto overflow-y-auto pb-2">
            <table className="w-full border-separate border-spacing-0 text-sm">
                <thead className="sticky top-0 z-20 bg-card">
                    <tr>
                        <th className="sticky left-0 z-10 bg-card px-4 py-2 text-left align-bottom font-medium">
                            <button
                                type="button"
                                className="inline-flex items-center gap-1 text-left text-xs text-muted-foreground hover:text-foreground"
                                onClick={() => setSortPart(null)}
                                title={peopleRows ? 'Order people by how many parts they used' : 'Order teams by size'}
                            >
                                {peopleRows ? 'Person' : 'Team'}
                                {sortPart === null && <ArrowDown className="h-3 w-3" />}
                            </button>
                        </th>
                        {PARTS.map((part, index) => !isShown(index) ? null : (
                            <th key={part.key} className="px-1 py-2 align-bottom font-medium" style={{ width: '10%' }}>
                                <button
                                    type="button"
                                    className="inline-flex w-full items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                                    aria-pressed={sortPart === index}
                                    title={`${part.hint}. Select to rank ${noun} on this.`}
                                    onClick={() => setSortPart(sortPart === index ? null : index)}
                                >
                                    <span className={sortPart === index ? 'text-foreground' : undefined}>{part.label}</span>
                                    {sortPart === index && <ArrowDown className="h-3 w-3 text-foreground" />}
                                </button>
                            </th>
                        ))}
                    </tr>
                    {/* The top row stays in view with the column names while the rows below scroll */}
                    <tr>
                        <td className={`sticky left-0 z-10 ${divider} bg-card px-4 py-2`}>
                            {peopleRows ? (
                                // An open team's people fold away under its own row, leaving the team's shares
                                <button type="button" className="flex items-center gap-1.5 text-left" aria-expanded={arePeopleShown} title={arePeopleShown ? 'Hide the people' : 'Show the people'} onClick={() => setArePeopleShown(!arePeopleShown)}>
                                    {arePeopleShown ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                                    <span>
                                        <span className="block font-semibold">{focus ? focus.team.name : 'Everyone'}</span>
                                        <span className="ad-count block text-xs text-muted-foreground">{formatCount(organisation.total)} people</span>
                                    </span>
                                </button>
                            ) : (
                                <>
                                    <div className="font-semibold">{focus ? focus.team.name : 'Everyone'}</div>
                                    <div className="ad-count text-xs text-muted-foreground">{formatCount(organisation.total)} people</div>
                                </>
                            )}
                        </td>
                        {everyone.map((count, index) => !isShown(index) ? null : (
                            <td key={PARTS[index].key} className={`${divider} p-1`}>
                                <div className="ad-count flex h-9 items-center justify-center rounded text-xs font-medium text-muted-foreground">
                                    {formatShare(count, organisation.total)}
                                </div>
                            </td>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {(arePeopleShown ? peopleRows : null)?.map((person, rowIndex) => (
                        <tr key={person.id}>
                            <td className="sticky left-0 z-10 bg-card px-4 py-1">
                                <span className="block max-w-[220px] truncate font-medium">{person.name}</span>
                            </td>
                            {PARTS.map((part, index) => {
                                if (!isShown(index)) return null;
                                const used = hasPart(person.parts, index);
                                const { style, ...sweeping } = cellSweep(index, rowIndex);
                                return (
                                    <td key={part.key} className="p-1">
                                        <div
                                            className={`${used ? 'ad-heat text-white' : 'text-muted-foreground'} flex h-9 w-full items-center justify-center rounded text-xs`}
                                            style={{ ['--share' as string]: 1, ...style }}
                                            {...sweeping}
                                            title={`${person.name} ${used ? 'used' : 'did not use'} ${part.label.toLowerCase()} in the last 30 days`}
                                        >
                                            {used ? <Check className="h-4 w-4" aria-label="Used" /> : <span aria-label="Did not use">–</span>}
                                        </div>
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                    {(peopleRows ? [] : rows).map((row, rowIndex) => (
                        <tr key={row.id}>
                            <td className="sticky left-0 z-10 bg-card px-4 py-1">
                                <button
                                    type="button"
                                    className="block max-w-[220px] text-left hover:underline"
                                    onClick={() => onOpen(row.id, null)}
                                >
                                    <span className={`block truncate font-medium ${row.isNoTeam ? 'italic' : ''}`}>{row.name}</span>
                                    <span className="ad-count block text-xs text-muted-foreground">{formatCount(row.people)} people</span>
                                </button>
                            </td>
                            {row.parts.map((count, index) => {
                                if (!isShown(index)) return null;
                                const share = row.people > 0 ? count / row.people : 0;
                                const isOpen = selectedId === row.id && selectedPart === index;
                                const { style, ...sweeping } = cellSweep(index, rowIndex);
                                return (
                                    <td key={PARTS[index].key} className="p-1">
                                        <button
                                            type="button"
                                            {...sweeping}
                                            className={`ad-heat ad-count flex h-9 w-full items-center justify-center rounded text-xs font-medium outline-offset-1 hover:outline hover:outline-1 hover:outline-foreground ${isOpen ? 'outline outline-2 outline-foreground' : ''} ${share > 0.55 ? 'text-white' : 'text-foreground'}`}
                                            style={{ ['--share' as string]: share, ...style }}
                                            title={`${row.name}: ${formatCount(count)} of ${formatCount(row.people)} people used ${PARTS[index].label.toLowerCase()} in the last 30 days`}
                                            onClick={() => onOpen(row.id, index)}
                                        >
                                            {count === 0 ? <span className="text-muted-foreground">0%</span> : formatShare(count, row.people)}
                                        </button>
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};
