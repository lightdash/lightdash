import { ArrowLeft, Pencil, Plus, RefreshCw, Trash2, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatPeople, type Cell, type GroupInfo, type Person, type Team, type TeamConfig } from '../model';
import { GroupPicker } from './GroupPicker';
import { TeamEditor } from './TeamEditor';

const newTeamId = (): string =>
    `team:${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`;

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    groups: GroupInfo[];
    // People whose names are already known, so team members can be shown by name
    people: Person[];
    // Everyone by name when the whole organisation is loaded, otherwise null
    directory: Cell[] | null;
    config: TeamConfig;
    onSave: (config: TeamConfig) => void;
    // What the saved value's state says, shown at the foot of the screen
    status: { persisted: boolean; error: string | null; lastChanged: string | null };
};

const isEmpty = (team: Team): boolean => team.groupIds.length === 0 && (team.memberIds ?? []).length === 0;

// Admins build the teams: name them, and put groups and people in them. Saved for every viewer.
export const TeamMapping = ({ open, onOpenChange, groups, people, directory, config, onSave, status }: Props) => {
    const [draft, setDraft] = useState<Team[]>(() => config.teams ?? []);
    const [primary, setPrimary] = useState(config.primary);
    const [isDirty, setIsDirty] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [sync, setSync] = useState<'idle' | 'syncing' | 'done'>('idle');
    // Names of people picked in this screen, which the overview may not have loaded
    const [picked, setPicked] = useState<Map<string, string>>(new Map());
    // The draft starts again from what is saved each time the screen opens
    const [wasOpen, setWasOpen] = useState(open);
    if (open !== wasOpen) {
        setWasOpen(open);
        if (open) {
            setDraft(config.teams ?? []);
            setPrimary(config.primary);
            setIsDirty(false);
            setEditingId(null);
            setSync('idle');
        }
    }
    // The CRM sync is only a preview for now: it pretends to work, then says nothing is connected
    useEffect(() => {
        if (sync !== 'syncing') return undefined;
        const timer = window.setTimeout(() => setSync('done'), 1200);
        return () => window.clearTimeout(timer);
    }, [sync]);

    const groupsById = useMemo(() => new Map(groups.map((group) => [group.id, group])), [groups]);
    const nameOf = useMemo(() => {
        const names = new Map(people.map((person) => [person.id, person.name]));
        picked.forEach((name, id) => names.set(id, name));
        return (id: string) => names.get(id) ?? 'Someone no longer in the organisation';
    }, [people, picked]);

    const update = (teamId: string, patch: Partial<Team>) => {
        setDraft((previous) => previous.map((team) => (team.id === teamId ? { ...team, ...patch } : team)));
        setIsDirty(true);
    };
    const addTeam = (team: Team) => {
        setDraft((previous) => [...previous, team]);
        setIsDirty(true);
    };
    const removeTeam = (teamId: string) => {
        setDraft((previous) => previous.filter((team) => team.id !== teamId));
        setIsDirty(true);
        setEditingId(null);
    };
    const createBlank = () => {
        const team: Team = { id: newTeamId(), name: 'New team', groupIds: [] };
        addTeam(team);
        setEditingId(team.id);
    };
    const createFromGroup = (group: GroupInfo) => {
        const id = `group:${group.id}`;
        addTeam({ id: draft.some((team) => team.id === id) ? newTeamId() : id, name: group.name, groupIds: [group.id] });
    };
    const addPerson = (teamId: string, person: Person) => {
        setPicked((previous) => new Map(previous).set(person.id, person.name));
        const team = draft.find((each) => each.id === teamId);
        if (team && !(team.memberIds ?? []).includes(person.id)) update(teamId, { memberIds: [...(team.memberIds ?? []), person.id] });
    };

    const save = () => {
        // A team with neither groups nor people is left out
        const teams = draft
            .filter((team) => !isEmpty(team))
            .map(({ memberIds, ...team }): Team => ({
                ...team,
                name: team.name.trim() || 'Unnamed team',
                ...((memberIds ?? []).length > 0 ? { memberIds } : {}),
            }));
        const kept = new Set(teams.map((team) => team.id));
        onSave({ teams, primary: Object.fromEntries(Object.entries(primary).filter(([, teamId]) => kept.has(teamId))) });
        setIsDirty(false);
    };
    const pinned = Object.keys(primary).length;
    const editing = draft.find((team) => team.id === editingId) ?? null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col gap-3" aria-describedby={undefined}>
                {editing ? (
                    <>
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Back to teams" onClick={() => setEditingId(null)}>
                                    <ArrowLeft />
                                </Button>
                                Edit team
                            </DialogTitle>
                        </DialogHeader>
                        <TeamEditor
                            team={editing}
                            groups={groups}
                            nameOf={nameOf}
                            directory={directory}
                            onChange={(patch) => update(editing.id, patch)}
                            onAddPerson={(person) => addPerson(editing.id, person)}
                        />
                        <DialogFooter className="gap-2 sm:justify-between">
                            <Button variant="outline" size="sm" onClick={() => removeTeam(editing.id)}>
                                <Trash2 />
                                Delete team
                            </Button>
                            <Button size="sm" onClick={() => setEditingId(null)}>
                                Done
                            </Button>
                        </DialogFooter>
                    </>
                ) : (
                    <>
                        <DialogHeader>
                            <DialogTitle>Teams</DialogTitle>
                        </DialogHeader>
                        <div className="flex flex-wrap items-center gap-2">
                            <Button size="sm" onClick={createBlank}>
                                <Plus />
                                New team
                            </Button>
                            <GroupPicker groups={groups} selectedIds={draft.flatMap((team) => (team.id.startsWith('group:') ? team.groupIds : []))} onPick={createFromGroup} closeOnPick>
                                <Button variant="outline" size="sm">
                                    <Users />
                                    Create from a group
                                </Button>
                            </GroupPicker>
                            <Button variant="outline" size="sm" disabled={sync === 'syncing'} onClick={() => setSync('syncing')}>
                                <RefreshCw className={sync === 'syncing' ? 'animate-spin' : undefined} />
                                Sync from CRM
                            </Button>
                            {sync === 'done' && <span className="text-xs text-muted-foreground">No CRM is connected yet, so nothing was synced.</span>}
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto rounded-md border">
                            <table className="w-full text-sm">
                                <thead className="sticky top-0 bg-card text-xs text-muted-foreground">
                                    <tr>
                                        <th className="px-3 py-2 text-left font-medium">Team</th>
                                        <th className="px-3 py-2 text-left font-medium">Groups</th>
                                        <th className="px-3 py-2 text-right font-medium">People added</th>
                                        <th className="w-20 px-3 py-2" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {draft.length === 0 ? (
                                        <tr className="border-t">
                                            <td colSpan={4} className="px-3 py-8 text-center text-sm text-muted-foreground">
                                                No teams yet.
                                            </td>
                                        </tr>
                                    ) : (
                                        draft.map((team) => {
                                            const names = team.groupIds.map((id) => groupsById.get(id)?.name ?? 'A group that no longer exists');
                                            return (
                                                <tr key={team.id} className="border-t hover:bg-muted/50">
                                                    <td className="max-w-[200px] truncate px-3 py-2 font-medium" title={team.name}>
                                                        {team.name || 'Unnamed team'}
                                                    </td>
                                                    <td className="max-w-[240px] truncate px-3 py-2 text-muted-foreground" title={names.join(', ')}>
                                                        {names.length > 0 ? names.join(', ') : '—'}
                                                    </td>
                                                    <td className="ad-count px-3 py-2 text-right text-muted-foreground">{(team.memberIds ?? []).length || '—'}</td>
                                                    <td className="px-3 py-1">
                                                        <div className="flex justify-end gap-0.5">
                                                            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Edit ${team.name || 'team'}`} onClick={() => setEditingId(team.id)}>
                                                                <Pencil />
                                                            </Button>
                                                            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Delete ${team.name || 'team'}`} onClick={() => removeTeam(team.id)}>
                                                                <Trash2 />
                                                            </Button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <div className="space-y-1 text-xs text-muted-foreground">
                            {draft.some(isEmpty) && <p className="m-0">Teams with no groups or people are not saved.</p>}
                            {pinned > 0 && (
                                <p className="m-0">
                                    {formatPeople(pinned)} {pinned === 1 ? 'is' : 'are'} shown in one team only.{' '}
                                    <button
                                        type="button"
                                        className="underline"
                                        onClick={() => {
                                            setPrimary({});
                                            setIsDirty(true);
                                        }}
                                    >
                                        Show them in every team again
                                    </button>
                                </p>
                            )}
                            {status.lastChanged && <p className="m-0">{status.lastChanged}</p>}
                            {!status.persisted && <p className="m-0 text-destructive">Changes cannot be saved here, so they will last only until you close this page.</p>}
                            {status.error && <p className="m-0 text-destructive">{status.error}</p>}
                        </div>
                        <DialogFooter className="gap-2">
                            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                                {isDirty ? 'Cancel' : 'Close'}
                            </Button>
                            <Button size="sm" disabled={!isDirty} onClick={save}>
                                Save for everyone
                            </Button>
                        </DialogFooter>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
};
