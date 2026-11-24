/**
 * A live data source's explores: the rows on the source page with their
 * switches, and on an explore's page an Edit button for its name,
 * description, AI hint and whether it is in use.
 */
import {
    type LiveSourceExploreChange,
    type LiveSourceExploreFields,
} from '@lightdash/common';
import {
    Anchor,
    Badge,
    Box,
    Button,
    Group,
    Stack,
    Switch,
    Text,
    Textarea,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { IconPencil } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import MantineModal from '../../components/common/MantineModal';
import {
    useLiveSourceFields,
    useUpdateLiveSourceExplores,
} from '../externalConnections/hooks/useLiveSourceFields';
import {
    SettingsCard,
    SettingsRow,
} from '../externalConnections/liveSources/LiveSourceSettingsRows';
import { LiveSourceSwitchOffModal } from '../externalConnections/liveSources/LiveSourceSwitchOffModal';
import { summaryOf } from './model';

type LiveSourceParams = { projectUuid: string; connectionUuid: string };

/**
 * Saves explore changes, asking first when one switches off an explore that
 * saved charts use.
 */
const useExploreSave = (params: LiveSourceParams) => {
    const update = useUpdateLiveSourceExplores(params);
    const [pending, setPending] = useState<{
        explore: LiveSourceExploreFields;
        change: LiveSourceExploreChange;
        onSaved?: () => void;
    } | null>(null);
    const save = (
        explore: LiveSourceExploreFields,
        change: LiveSourceExploreChange,
        onSaved?: () => void,
    ) => {
        if (change.inUse === false && explore.usedByChartCount > 0) {
            setPending({ explore, change, onSaved });
            return;
        }
        update.mutate([change], { onSuccess: () => onSaved?.() });
    };
    const confirmModal = pending ? (
        <LiveSourceSwitchOffModal
            projectUuid={params.projectUuid}
            connectionUuid={params.connectionUuid}
            exploreName={pending.explore.exploreName}
            fieldName={null}
            label={pending.explore.label}
            isSaving={update.isLoading}
            onConfirm={() =>
                update.mutate([pending.change], {
                    onSuccess: () => {
                        setPending(null);
                        pending.onSaved?.();
                    },
                })
            }
            onClose={() => setPending(null)}
        />
    ) : null;
    // The change being saved, so a switch shows where it's going at once.
    const saving = update.isLoading ? update.variables?.[0] : undefined;
    return { save, saving, isSaving: update.isLoading, confirmModal };
};

/** Every explore of a live data source, on or off, each with its switch. */
export const LiveExploreRows: FC<
    LiveSourceParams & {
        /** Whether the explore is built and its page can be opened. */
        isOpenable: (exploreName: string) => boolean;
        onOpen: (exploreName: string) => void;
    }
> = ({ projectUuid, connectionUuid, isOpenable, onOpen }) => {
    const params = { projectUuid, connectionUuid };
    const { data: fields } = useLiveSourceFields(params);
    const { save, saving, confirmModal } = useExploreSave(params);
    if (!fields) return null;
    // Same order as the sidebar
    const explores = [...fields.explores].sort((a, b) =>
        a.label.localeCompare(b.label),
    );
    return (
        <>
            <SettingsCard>
                {explores.map((explore) => {
                    const isSaving =
                        saving?.exploreName === explore.exploreName &&
                        saving.inUse !== undefined;
                    const inUse = isSaving
                        ? saving.inUse === true
                        : explore.inUse;
                    const openable =
                        explore.inUse && isOpenable(explore.exploreName);
                    return (
                        <SettingsRow
                            key={explore.exploreName}
                            dimmed={!inUse}
                            label={
                                openable ? (
                                    <Anchor
                                        component="button"
                                        type="button"
                                        c="inherit"
                                        fw={500}
                                        fz="inherit"
                                        onClick={() =>
                                            onOpen(explore.exploreName)
                                        }
                                    >
                                        {explore.label}
                                    </Anchor>
                                ) : (
                                    explore.label
                                )
                            }
                            hint={
                                summaryOf(explore.description) && (
                                    <Text
                                        inherit
                                        truncate="end"
                                        title={explore.description}
                                    >
                                        {summaryOf(explore.description)}
                                    </Text>
                                )
                            }
                        >
                            <Switch
                                size="xs"
                                aria-label={`${explore.label} in use`}
                                checked={inUse}
                                onChange={(event) => {
                                    // One save at a time; the next click waits for it
                                    if (saving) return;
                                    save(explore, {
                                        exploreName: explore.exploreName,
                                        inUse: event.currentTarget.checked,
                                    });
                                }}
                            />
                        </SettingsRow>
                    );
                })}
            </SettingsCard>
            {confirmModal}
        </>
    );
};

type Details = {
    inUse: boolean;
    label: string;
    description: string;
    aiHint: string;
};

const toDetails = (explore: LiveSourceExploreFields): Details => ({
    inUse: explore.inUse,
    label: explore.label,
    description: explore.description,
    aiHint: explore.aiHint ?? '',
});

/** Only what changed; an emptied AI hint clears it. */
const toChange = (
    exploreName: string,
    draft: Details,
    saved: Details,
): LiveSourceExploreChange => ({
    exploreName,
    ...(draft.inUse !== saved.inUse ? { inUse: draft.inUse } : {}),
    ...(draft.label !== saved.label ? { label: draft.label } : {}),
    ...(draft.description !== saved.description
        ? { description: draft.description }
        : {}),
    ...(draft.aiHint !== saved.aiHint
        ? { aiHint: draft.aiHint.trim() ? draft.aiHint : null }
        : {}),
});

const useLiveExplore = ({
    exploreName,
    ...params
}: LiveSourceParams & { exploreName: string }) => {
    const { data: fields } = useLiveSourceFields(params);
    return fields?.explores.find(
        (explore) => explore.exploreName === exploreName,
    );
};

export const LiveExploreEditAction: FC<
    LiveSourceParams & {
        exploreName: string;
        /** Once switched off the explore isn't built, so its page goes away. */
        onSwitchedOff: () => void;
    }
> = ({ exploreName, onSwitchedOff, ...params }) => {
    const explore = useLiveExplore({ exploreName, ...params });
    const { save, isSaving, confirmModal } = useExploreSave(params);
    const [draft, setDraft] = useState<Details | null>(null);
    if (!explore) return null;
    const saved = toDetails(explore);
    const isDirty =
        draft !== null &&
        Object.keys(toChange(exploreName, draft, saved)).length > 1;
    const set = (key: Exclude<keyof Details, 'inUse'>) => (value: string) =>
        setDraft((current) => current && { ...current, [key]: value });
    return (
        <>
            <Button
                size="xs"
                variant="default"
                leftSection={<MantineIcon icon={IconPencil} />}
                onClick={() => setDraft(saved)}
            >
                Edit
            </Button>
            <MantineModal
                opened={draft !== null}
                onClose={() => setDraft(null)}
                title={`Edit ${explore.label}`}
                icon={IconPencil}
                confirmLabel="Save changes"
                confirmDisabled={!isDirty}
                confirmLoading={isSaving}
                onConfirm={() => {
                    if (!draft) return;
                    const change = toChange(exploreName, draft, saved);
                    save(explore, change, () => {
                        setDraft(null);
                        if (change.inUse === false) onSwitchedOff();
                    });
                }}
            >
                {draft ? (
                    <Stack gap="md">
                        <TextInput
                            label="Name"
                            description="Shown in explores and to agents"
                            value={draft.label}
                            onChange={(event) =>
                                set('label')(event.currentTarget.value)
                            }
                        />
                        <Textarea
                            label="Description"
                            description="Shown to people picking it"
                            autosize
                            minRows={2}
                            maxRows={6}
                            value={draft.description}
                            onChange={(event) =>
                                set('description')(event.currentTarget.value)
                            }
                        />
                        <Textarea
                            label="AI hint"
                            description="Helps agents use this explore"
                            placeholder="For example: only active customers"
                            autosize
                            minRows={2}
                            maxRows={6}
                            value={draft.aiHint}
                            onChange={(event) =>
                                set('aiHint')(event.currentTarget.value)
                            }
                        />
                        <Group justify="space-between" wrap="nowrap" gap="md">
                            <Box>
                                <Text fz="sm" fw={500}>
                                    In use
                                </Text>
                                <Text fz="xs" c="dimmed">
                                    People and agents can query it
                                </Text>
                            </Box>
                            <Switch
                                aria-label="In use"
                                checked={draft.inUse}
                                onChange={(event) => {
                                    const inUse = event.currentTarget.checked;
                                    setDraft(
                                        (current) =>
                                            current && { ...current, inUse },
                                    );
                                }}
                            />
                        </Group>
                    </Stack>
                ) : null}
            </MantineModal>
            {confirmModal}
        </>
    );
};

/** Beside an explore's name while people and agents can't query it. */
export const LiveExploreNotInUseBadge: FC<
    LiveSourceParams & { exploreName: string }
> = (props) => {
    const explore = useLiveExplore(props);
    if (!explore || explore.inUse) return null;
    return (
        <Tooltip label="Hidden from people and agents" withinPortal>
            <Badge color="gray" variant="light" radius="sm">
                Not in use
            </Badge>
        </Tooltip>
    );
};
