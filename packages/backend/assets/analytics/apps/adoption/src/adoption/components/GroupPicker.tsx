import { Check } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatCount, type GroupInfo } from '../model';

type Props = {
    groups: GroupInfo[];
    // Groups already chosen, shown ticked and not pickable again
    selectedIds: string[];
    onPick: (group: GroupInfo) => void;
    // Closes after one pick, for choosing a single group
    closeOnPick?: boolean;
    children: ReactNode;
};

// Search the organisation's groups and pick from them. The trigger button is passed in.
export const GroupPicker = ({ groups, selectedIds, onPick, closeOnPick = false, children }: Props) => {
    const [open, setOpen] = useState(false);
    const [text, setText] = useState('');
    const term = text.trim().toLowerCase();
    const found = groups.filter((group) => group.name.toLowerCase().includes(term));
    return (
        <Popover
            open={open}
            onOpenChange={(next) => {
                setOpen(next);
                if (!next) setText('');
            }}
        >
            <PopoverTrigger asChild>{children}</PopoverTrigger>
            <PopoverContent align="start" className="w-72 space-y-2 p-2">
                {groups.length === 0 ? (
                    <p className="m-0 px-2 py-3 text-xs text-muted-foreground">This organisation has no groups yet.</p>
                ) : (
                    <>
                        <Input
                            autoFocus
                            className="h-8 text-sm"
                            placeholder="Search groups"
                            aria-label="Search groups"
                            value={text}
                            onChange={(event) => setText(event.target.value)}
                        />
                        {found.length === 0 ? (
                            <p className="m-0 px-2 py-3 text-xs text-muted-foreground">No group matches that name.</p>
                        ) : (
                            // The dialog behind blocks scrolling outside itself, so the list keeps wheel and touch scrolling to itself
                            <ul
                                className="m-0 max-h-60 list-none overflow-y-auto overscroll-contain p-0"
                                onWheel={(event) => event.stopPropagation()}
                                onTouchMove={(event) => event.stopPropagation()}
                            >
                                {found.map((group) => {
                                    const isPicked = selectedIds.includes(group.id);
                                    return (
                                        <li key={group.id}>
                                            <button
                                                type="button"
                                                disabled={isPicked}
                                                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-60 disabled:hover:bg-transparent"
                                                onClick={() => {
                                                    onPick(group);
                                                    if (closeOnPick) setOpen(false);
                                                }}
                                            >
                                                <span className="min-w-0 flex-1 truncate">{group.name}</span>
                                                <span className="ad-count shrink-0 text-xs text-muted-foreground">{formatCount(group.people)}</span>
                                                {isPicked && <Check className="h-4 w-4 shrink-0 text-muted-foreground" aria-label="Already chosen" />}
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </>
                )}
            </PopoverContent>
        </Popover>
    );
};
