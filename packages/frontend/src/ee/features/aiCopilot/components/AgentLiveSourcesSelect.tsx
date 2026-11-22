import { MultiSelect, SegmentedControl, Stack, Text } from '@mantine/core';
import { useMemo, useState, type FC } from 'react';
import { useExternalConnections } from '../../../../features/externalConnections/hooks/useExternalConnections';

type Mode = 'all' | 'none' | 'only';

const toMode = (value: string[] | null): Mode => {
    if (value === null) return 'all';
    return value.length === 0 ? 'none' : 'only';
};

type Props = {
    projectUuid: string;
    /** null for every integration, [] for none, or the chosen uuids. */
    value: string[] | null;
    onChange: (value: string[] | null) => void;
};

/** The integrations an agent can use: all of them, none, or only some. */
export const AgentLiveSourcesSelect: FC<Props> = ({
    projectUuid,
    value,
    onChange,
}) => {
    const { data: connections, isInitialLoading } =
        useExternalConnections(projectUuid);
    // An empty list is "None", unless "Only these" was just chosen and nothing is picked yet
    const [isPickingOnly, setIsPickingOnly] = useState(false);
    const mode: Mode =
        isPickingOnly && value?.length === 0 ? 'only' : toMode(value);

    // The list holds only integrations this person can view
    const options = useMemo(() => {
        const visible = (connections ?? [])
            .filter((connection) => connection.kind === 'live_source')
            .map((connection) => ({
                value: connection.externalConnectionUuid,
                label: connection.name,
            }));
        const visibleUuids = new Set(visible.map((option) => option.value));
        // Kept on save, so the agent doesn't lose an integration this person can't see
        const hidden = (value ?? [])
            .filter((uuid) => !visibleUuids.has(uuid))
            .map((uuid) => ({
                value: uuid,
                label: 'Integration you cannot view',
                disabled: true,
            }));
        return [...visible, ...hidden];
    }, [connections, value]);

    const handleModeChange = (next: string) => {
        const nextMode = next as Mode;
        setIsPickingOnly(nextMode === 'only');
        if (nextMode === 'all') onChange(null);
        if (nextMode === 'none') onChange([]);
        if (nextMode === 'only') onChange(value ?? []);
    };

    return (
        <Stack gap="xs">
            <SegmentedControl
                size="xs"
                aria-label="Integrations"
                value={mode}
                onChange={handleModeChange}
                data={[
                    { value: 'all', label: 'All' },
                    { value: 'none', label: 'None' },
                    { value: 'only', label: 'Only these' },
                ]}
            />
            {mode === 'only' && (
                <MultiSelect
                    aria-label="Integrations the agent can use"
                    placeholder={
                        isInitialLoading
                            ? 'Loading integrations...'
                            : 'Select integrations'
                    }
                    data={options}
                    value={value ?? []}
                    onChange={onChange}
                    searchable
                    clearable
                />
            )}
            <Text fz="xs" c="dimmed">
                {mode === 'all' &&
                    'The agent can use every integration in this project, including ones added later.'}
                {mode === 'none' && 'The agent never queries an integration.'}
                {mode === 'only' &&
                    'The agent can use only these integrations. New ones are left out until you add them.'}
            </Text>
        </Stack>
    );
};
