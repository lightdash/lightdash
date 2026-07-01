import { Select, Stack, TextInput } from '@mantine-8/core';
import { IconDeviceFloppy } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import MantineModal from '../../components/common/MantineModal';
import { useCreateMutation } from '../../hooks/useSavedQuery';
import { useSpaceSummaries } from '../../hooks/useSpaces';
import type { QueryEvent } from './hooks/useAppSdkBridge';
import { trackedQueryToCreateChart } from './utils/trackedQueryToChart';

type Props = {
    query: QueryEvent;
    projectUuid: string;
    opened: boolean;
    onClose: () => void;
};

/**
 * Saves a tracked app query as a governed Lightdash table chart. Lives in the
 * Query Inspector (host chrome) — the sandboxed app never sees it. Reuses the
 * standard create-chart mutation, which shows the success toast + "View chart"
 * action and surfaces permission errors, so this modal only collects a name +
 * target space.
 */
const SaveQueryToLightdashModal: FC<Props> = ({
    query,
    projectUuid,
    opened,
    onClose,
}) => {
    const { data: spaces, isLoading: spacesLoading } =
        useSpaceSummaries(projectUuid);
    const createChart = useCreateMutation({ redirectOnSuccess: false });

    const [name, setName] = useState(
        query.label || query.exploreName || 'Untitled query',
    );
    const [spaceUuid, setSpaceUuid] = useState<string | null>(null);

    const spaceOptions = useMemo(
        () => (spaces ?? []).map((s) => ({ value: s.uuid, label: s.name })),
        [spaces],
    );
    // Derived (not synced state): default to the first accessible space until
    // the user picks one.
    const selectedSpace = spaceUuid ?? spaceOptions[0]?.value ?? null;

    const handleSave = () => {
        if (!name.trim()) return;
        const payload = trackedQueryToCreateChart(query, {
            name: name.trim(),
            spaceUuid: selectedSpace ?? undefined,
        });
        if (!payload) return;
        createChart.mutate(payload, {
            // The hook's own onSuccess shows the toast + "View chart" action;
            // this per-call handler just closes the modal.
            onSuccess: () => onClose(),
        });
    };

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Save to Lightdash"
            icon={IconDeviceFloppy}
            size="sm"
            onConfirm={handleSave}
            confirmLabel="Save"
            confirmLoading={createChart.isLoading}
            confirmDisabled={!name.trim()}
        >
            <Stack gap="sm">
                <TextInput
                    label="Chart name"
                    placeholder="e.g. Weekly revenue"
                    required
                    value={name}
                    onChange={(e) => setName(e.currentTarget.value)}
                    data-autofocus
                />
                <Select
                    label="Space"
                    placeholder={
                        spacesLoading ? 'Loading spaces…' : 'Select a space'
                    }
                    data={spaceOptions}
                    value={selectedSpace}
                    onChange={setSpaceUuid}
                    disabled={spacesLoading}
                    searchable
                    nothingFoundMessage="No spaces found"
                />
            </Stack>
        </MantineModal>
    );
};

export default SaveQueryToLightdashModal;
