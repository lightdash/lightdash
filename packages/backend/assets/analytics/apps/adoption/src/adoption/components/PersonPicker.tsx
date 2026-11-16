import { Check, Loader2, Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { source, type PeopleFilter } from '../queries/source';
import type { Cell, Person } from '../model';

const SHOWN = 30;

type Props = {
    // People already on the team, which cannot be picked again
    selectedIds: string[];
    onPick: (person: Person) => void;
    label: string;
    // Everyone in the organisation by name when that is already loaded; searched in the warehouse when null
    directory: Cell[] | null;
};

type ListProps = { cells: Cell[]; selectedIds: Set<string>; onPick: (person: Person) => void; lineage?: Record<string, string | undefined> };

const ResultList = ({ cells, selectedIds, onPick, lineage }: ListProps) => {
    const found = cells.filter((cell) => cell.person !== null);
    if (found.length === 0) return <p className="m-0 px-2 py-3 text-xs text-muted-foreground">Nobody matches that name.</p>;
    return (
        // The dialog behind blocks scrolling outside itself, so the list keeps wheel and touch scrolling to itself
        <ul
            className="m-0 max-h-60 list-none overflow-y-auto overscroll-contain p-0"
            onWheel={(event) => event.stopPropagation()}
            onTouchMove={(event) => event.stopPropagation()}
            {...lineage}
        >
            {found.map((cell) => {
                const person = cell.person as Person;
                const isPicked = selectedIds.has(person.id);
                return (
                    <li key={person.id}>
                        <button
                            type="button"
                            disabled={isPicked}
                            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-60 disabled:hover:bg-transparent"
                            onClick={() => onPick(person)}
                        >
                            <span className="min-w-0 flex-1">
                                <span className="block truncate">{person.name}</span>
                                {cell.groupNames.length > 0 && <span className="block truncate text-xs text-muted-foreground">{cell.groupNames.join(', ')}</span>}
                            </span>
                            {isPicked && <Check className="h-4 w-4 shrink-0 text-muted-foreground" aria-label="Already on this team" />}
                        </button>
                    </li>
                );
            })}
        </ul>
    );
};

// Everyone is already loaded, so the search is instant and ignores capital letters
const DirectoryResults = ({ term, directory, ...rest }: { term: string; directory: Cell[] } & Omit<ListProps, 'cells'>) => {
    const cells = useMemo(() => {
        const needle = term.trim().toLowerCase();
        return directory
            .filter((cell) => cell.person !== null && cell.person.name.toLowerCase().includes(needle))
            .sort((a, b) => (a.person?.name ?? '').localeCompare(b.person?.name ?? ''))
            .slice(0, SHOWN);
    }, [term, directory]);
    return <ResultList cells={cells} {...rest} />;
};

const SearchResults = ({ term, ...rest }: { term: string } & Omit<ListProps, 'cells' | 'lineage'>) => {
    const filter = useMemo<PeopleFilter>(() => ({ kind: 'search', term }), [term]);
    const people = source.usePeople(filter);
    if (people.loading) {
        return (
            <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
        );
    }
    if (people.error) return <p className="m-0 px-2 py-3 text-xs text-destructive">People could not be loaded.</p>;
    return <ResultList cells={people.data} lineage={people.lineage} {...rest} />;
};

// Search people by name and add them one at a time; stays open so several can be added in a row
export const PersonPicker = ({ selectedIds, onPick, label, directory }: Props) => {
    const [open, setOpen] = useState(false);
    const [text, setText] = useState('');
    const [term, setTerm] = useState('');
    // A warehouse search waits for a pause in typing so it does not run on every key
    useEffect(() => {
        const timer = window.setTimeout(() => setTerm(text), 300);
        return () => window.clearTimeout(timer);
    }, [text]);
    const picked = useMemo(() => new Set(selectedIds), [selectedIds]);
    return (
        <Popover
            open={open}
            onOpenChange={(next) => {
                setOpen(next);
                if (!next) {
                    setText('');
                    setTerm('');
                }
            }}
        >
            <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 text-xs" aria-label={label}>
                    <Plus />
                    Add people
                </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 space-y-2 p-2">
                <Input
                    autoFocus
                    className="h-8 text-sm"
                    placeholder="Search by name"
                    aria-label="Search people by name"
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                />
                {open &&
                    (directory ? (
                        <DirectoryResults term={text} directory={directory} selectedIds={picked} onPick={onPick} />
                    ) : (
                        <SearchResults term={term} selectedIds={picked} onPick={onPick} />
                    ))}
            </PopoverContent>
        </Popover>
    );
};
