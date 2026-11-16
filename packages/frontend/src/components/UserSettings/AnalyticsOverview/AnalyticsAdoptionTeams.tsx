import {
    type AnalyticsAdoptionTeam,
    type AnalyticsAdoptionTeamConfig,
    type ApiError,
} from '@lightdash/common';
import {
    Alert,
    Button,
    Group,
    Modal,
    MultiSelect,
    Select,
    Stack,
    Text,
    TextInput,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useOrganizationGroups } from '../../../hooks/useOrganizationGroups';
import { useOrganizationUsers } from '../../../hooks/useOrganizationUsers';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

const url = '/org/analytics-project/adoption-teams';

export const useAnalyticsAdoptionTeams = (projectUuid: string) => {
    const api = useLightdashApi();
    return useQuery<AnalyticsAdoptionTeamConfig, ApiError>({
        queryKey: ['analytics-adoption-teams', projectUuid],
        queryFn: () =>
            api<AnalyticsAdoptionTeamConfig>({
                url,
                method: 'GET',
                body: undefined,
            }),
        retry: false,
    });
};

type Choice = { value: string; label: string };

export const AnalyticsAdoptionTeams = ({
    projectUuid,
    config,
    groups,
    onClose,
}: {
    projectUuid: string;
    config: AnalyticsAdoptionTeamConfig;
    groups: Choice[];
    onClose: () => void;
}) => {
    const [teams, setTeams] = useState<AnalyticsAdoptionTeam[]>(
        () =>
            config.teams ??
            groups.map(({ value, label }) => ({
                id: value,
                name: label,
                groupIds: [value],
                memberIds: [],
            })),
    );
    const [primary, setPrimary] = useState(config.primary);
    const [teamId, setTeamId] = useState<string | null>(teams[0]?.id ?? null);
    const [memberSearch, setMemberSearch] = useState('');
    const [search] = useDebouncedValue(memberSearch, 250);
    const [knownPeople, setKnownPeople] = useState<Choice[]>([]);
    const { data: orgGroups } = useOrganizationGroups({});
    const { data: users } = useOrganizationUsers({ searchInput: search });
    const api = useLightdashApi();
    const client = useQueryClient();
    const key = ['analytics-adoption-teams', projectUuid];
    const save = useMutation<
        AnalyticsAdoptionTeamConfig,
        ApiError,
        AnalyticsAdoptionTeamConfig
    >({
        mutationFn: (next) =>
            api<AnalyticsAdoptionTeamConfig>({
                url,
                method: 'PUT',
                body: JSON.stringify(next),
            }),
        onSuccess: (next) => {
            client.setQueryData(key, next);
            onClose();
        },
        onError: () => void client.invalidateQueries(key),
    });

    const activeTeam = teams.find(({ id }) => id === teamId);
    const groupOptions = new Map<string, Choice>([
        ...groups.map((group) => [group.value, group] as const),
        ...(orgGroups ?? []).map(
            (group) =>
                [group.uuid, { value: group.uuid, label: group.name }] as const,
        ),
    ]);
    const people = new Map(knownPeople.map((person) => [person.value, person]));
    for (const user of users ?? []) {
        if (user.isActive)
            people.set(user.userUuid, {
                value: user.userUuid,
                label:
                    [user.firstName, user.lastName].filter(Boolean).join(' ') ||
                    user.email,
            });
    }
    for (const id of activeTeam?.memberIds ?? []) {
        if (!people.has(id)) people.set(id, { value: id, label: id });
    }
    for (const id of activeTeam?.groupIds ?? []) {
        if (!groupOptions.has(id))
            groupOptions.set(id, { value: id, label: id });
    }

    const edit = (patch: Partial<AnalyticsAdoptionTeam>) =>
        setTeams((previous) =>
            previous.map((team) =>
                team.id === teamId ? { ...team, ...patch } : team,
            ),
        );
    const saveTeams = () => {
        const primaryTeams = Object.fromEntries(
            Object.entries(primary).filter(([person, id]) =>
                teams.some(
                    (team) => team.id === id && team.memberIds.includes(person),
                ),
            ),
        );
        save.mutate({
            revision: config.revision,
            teams,
            primary: primaryTeams,
        });
    };
    const invalid = teams.some(
        ({ name, groupIds, memberIds }) =>
            !name.trim() || (groupIds.length === 0 && memberIds.length === 0),
    );

    return (
        <Modal
            opened
            onClose={onClose}
            size="lg"
            title="Configure Adoption teams"
            closeOnClickOutside={!save.isLoading}
        >
            <Stack>
                <Text size="sm" c="dimmed">
                    These teams are shared with everyone who can open the
                    Adoption tab. Use organization groups, individual members,
                    or both.
                </Text>
                <Group align="flex-end">
                    <Select
                        label="Team to edit"
                        placeholder="Select a team"
                        data={teams.map(({ id, name }) => ({
                            value: id,
                            label: name.trim() || 'Untitled team',
                        }))}
                        value={teamId}
                        onChange={setTeamId}
                        style={{ flex: 1 }}
                    />
                    <Button
                        variant="default"
                        disabled={teams.length >= 100}
                        onClick={() => {
                            const team = {
                                id: crypto.randomUUID(),
                                name: '',
                                groupIds: [],
                                memberIds: [],
                            };
                            setTeams([...teams, team]);
                            setTeamId(team.id);
                        }}
                    >
                        Add team
                    </Button>
                </Group>
                {activeTeam && (
                    <>
                        <TextInput
                            label="Team name"
                            value={activeTeam.name}
                            onChange={(event) =>
                                edit({ name: event.currentTarget.value })
                            }
                            maxLength={120}
                        />
                        <MultiSelect
                            label="Organization groups"
                            searchable
                            maxValues={100}
                            data={[...groupOptions.values()]}
                            value={activeTeam.groupIds}
                            onChange={(groupIds) => edit({ groupIds })}
                        />
                        <MultiSelect
                            label="Individual members"
                            description="People added directly to this team."
                            searchable
                            searchValue={memberSearch}
                            onSearchChange={setMemberSearch}
                            data={[...people.values()]}
                            value={activeTeam.memberIds}
                            onChange={(memberIds) => {
                                setKnownPeople([...people.values()]);
                                edit({ memberIds });
                            }}
                        />
                        {activeTeam.memberIds.length > 0 && (
                            <MultiSelect
                                label="Show these people only in this team"
                                data={activeTeam.memberIds.map(
                                    (id) =>
                                        people.get(id) ?? {
                                            value: id,
                                            label: id,
                                        },
                                )}
                                value={activeTeam.memberIds.filter(
                                    (id) => primary[id] === activeTeam.id,
                                )}
                                onChange={(ids) => {
                                    const next = Object.fromEntries(
                                        Object.entries(primary).filter(
                                            ([, id]) => id !== activeTeam.id,
                                        ),
                                    );
                                    ids.forEach((id) => {
                                        next[id] = activeTeam.id;
                                    });
                                    setPrimary(next);
                                }}
                            />
                        )}
                        <Button
                            color="red"
                            variant="subtle"
                            size="xs"
                            style={{ alignSelf: 'flex-start' }}
                            onClick={() => {
                                const remaining = teams.filter(
                                    ({ id }) => id !== teamId,
                                );
                                setTeams(remaining);
                                setTeamId(remaining[0]?.id ?? null);
                            }}
                        >
                            Remove team
                        </Button>
                    </>
                )}
                {save.isError && (
                    <Alert color="red">{save.error.error.message}</Alert>
                )}
                <Group justify="space-between">
                    {config.teams !== null ? (
                        <Button
                            variant="subtle"
                            disabled={save.isLoading}
                            onClick={() =>
                                save.mutate({
                                    revision: config.revision,
                                    teams: null,
                                    primary: {},
                                })
                            }
                        >
                            Use organization groups
                        </Button>
                    ) : (
                        <span />
                    )}
                    <Group>
                        <Button variant="default" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button
                            disabled={invalid}
                            loading={save.isLoading}
                            onClick={saveTeams}
                        >
                            Save teams
                        </Button>
                    </Group>
                </Group>
            </Stack>
        </Modal>
    );
};
