import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Cell, GroupInfo, Person, Team } from '../model';
import { GroupPicker } from './GroupPicker';
import { PersonPicker } from './PersonPicker';

type Props = {
    team: Team;
    groups: GroupInfo[];
    nameOf: (personId: string) => string;
    directory: Cell[] | null;
    onChange: (patch: Partial<Team>) => void;
    onAddPerson: (person: Person) => void;
};

const Chip = ({ label, onRemove, removeLabel }: { label: string; onRemove: () => void; removeLabel: string }) => (
    <li className="flex items-center gap-1 rounded-full border bg-muted py-0.5 pl-2.5 pr-1 text-xs">
        <span className="max-w-[220px] truncate">{label}</span>
        <button type="button" className="rounded-full p-0.5 text-muted-foreground hover:text-foreground" aria-label={removeLabel} onClick={onRemove}>
            <X className="h-3 w-3" />
        </button>
    </li>
);

// One team: its name, the groups whose people are in it, and people added by name
export const TeamEditor = ({ team, groups, nameOf, directory, onChange, onAddPerson }: Props) => {
    const memberIds = team.memberIds ?? [];
    const groupName = (id: string) => groups.find((group) => group.id === id)?.name ?? 'A group that no longer exists';
    return (
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-0.5">
            <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="team-name">
                    Team name
                </label>
                <Input id="team-name" className="h-9" value={team.name} onChange={(event) => onChange({ name: event.target.value })} />
            </div>
            <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                    <h3 className="m-0 text-sm font-semibold">Groups</h3>
                    <GroupPicker groups={groups} selectedIds={team.groupIds} onPick={(group) => onChange({ groupIds: [...team.groupIds, group.id] })}>
                        <Button variant="outline" size="sm" className="h-7 text-xs">
                            <Plus />
                            Add groups
                        </Button>
                    </GroupPicker>
                </div>
                {team.groupIds.length === 0 ? (
                    <p className="m-0 text-xs text-muted-foreground">No groups. Everyone in a group you add is in this team.</p>
                ) : (
                    <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
                        {team.groupIds.map((id) => (
                            <Chip
                                key={id}
                                label={groupName(id)}
                                removeLabel={`Remove ${groupName(id)} from this team`}
                                onRemove={() => onChange({ groupIds: team.groupIds.filter((each) => each !== id) })}
                            />
                        ))}
                    </ul>
                )}
            </div>
            <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                    <h3 className="m-0 text-sm font-semibold">People</h3>
                    <PersonPicker label="Add people to this team" selectedIds={memberIds} onPick={onAddPerson} directory={directory} />
                </div>
                {memberIds.length === 0 ? (
                    <p className="m-0 text-xs text-muted-foreground">No people added by name.</p>
                ) : (
                    <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
                        {memberIds.map((id) => (
                            <Chip
                                key={id}
                                label={nameOf(id)}
                                removeLabel={`Remove ${nameOf(id)} from this team`}
                                onRemove={() => onChange({ memberIds: memberIds.filter((each) => each !== id) })}
                            />
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
};
