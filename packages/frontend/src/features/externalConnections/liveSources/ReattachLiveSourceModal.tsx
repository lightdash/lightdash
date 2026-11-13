import { type ReattachableLiveSource } from '@lightdash/common';
import { Alert, Select, Stack } from '@mantine/core';
import { IconAlertTriangle, IconPlugConnected } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineModal from '../../../components/common/MantineModal';
import {
    useReattachableLiveSources,
    useReattachLiveSource,
} from '../hooks/useLiveSourceReattach';
import { formatChartCount, getApiSourceTarget } from './liveSourceCatalog';

type Props = {
    projectUuid: string;
    connectionUuid: string;
    onClose: () => void;
};

const toOptionLabel = ({
    name,
    explorePrefix,
    usedByChartCount,
}: ReattachableLiveSource) =>
    `${name} (${explorePrefix}) · ${formatChartCount(usedByChartCount)}`;

/**
 * Offered over a new source's page right after it connects, only when a
 * deleted source's charts could move to it.
 */
export const ReattachLiveSourceModal: FC<Props> = ({
    projectUuid,
    connectionUuid,
    onClose,
}) => {
    const { data: deletedSources = [] } = useReattachableLiveSources({
        projectUuid,
        connectionUuid,
    });
    const reattach = useReattachLiveSource({ projectUuid, connectionUuid });
    const [picked, setPicked] = useState<string | null>(null);

    // A same-target source with charts is the likely reconnect, so it starts selected
    const selected =
        deletedSources.find(
            ({ externalConnectionUuid }) => externalConnectionUuid === picked,
        ) ??
        deletedSources.find(
            ({ isSameTarget, usedByChartCount }) =>
                isSameTarget && usedByChartCount > 0,
        ) ??
        deletedSources[0];

    if (!selected) return null;
    return (
        <MantineModal
            opened
            onClose={onClose}
            title="Reattach a deleted source?"
            icon={IconPlugConnected}
            cancelLabel="Not now"
            cancelDisabled={reattach.isLoading}
            confirmLabel="Reattach"
            confirmLoading={reattach.isLoading}
            onConfirm={() =>
                reattach.mutate(selected.externalConnectionUuid, {
                    onSuccess: onClose,
                })
            }
        >
            <Stack gap="sm">
                <Select
                    allowDeselect={false}
                    label="Deleted source"
                    description="This source takes its explore prefix, so its charts work again and its field edits come back."
                    value={selected.externalConnectionUuid}
                    onChange={setPicked}
                    data={deletedSources.map((source) => ({
                        value: source.externalConnectionUuid,
                        label: toOptionLabel(source),
                    }))}
                />
                {!selected.isSameTarget && (
                    <Alert
                        color="yellow"
                        icon={<IconAlertTriangle size={16} />}
                    >
                        {selected.name} read{' '}
                        {getApiSourceTarget(selected.apiSource)}. Its charts
                        will show this source's data instead.
                    </Alert>
                )}
            </Stack>
        </MantineModal>
    );
};
