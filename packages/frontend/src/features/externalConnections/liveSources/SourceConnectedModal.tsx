import { type ReattachableLiveSource } from '@lightdash/common';
import { Alert, Loader, Select, Stack, Text } from '@mantine/core';
import { IconAlertTriangle, IconCircleCheck } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { useNavigate } from 'react-router';
import MantineModal from '../../../components/common/MantineModal';
import { getSemanticStudioSourceUrl } from '../../semanticStudio/urls';
import { useLiveSourceFields } from '../hooks/useLiveSourceFields';
import {
    useReattachableLiveSources,
    useReattachLiveSource,
} from '../hooks/useLiveSourceReattach';
import { formatChartCount, getApiSourceTarget } from './liveSourceCatalog';

const NO_REATTACH = 'none';

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

/** The last step of adding a source, wherever it was added from. */
export const SourceConnectedModal: FC<Props> = ({
    projectUuid,
    connectionUuid,
    onClose,
}) => {
    const navigate = useNavigate();
    const { data } = useLiveSourceFields({ projectUuid, connectionUuid });
    const { data: deletedSources = [], isLoading: isLoadingDeleted } =
        useReattachableLiveSources({ projectUuid, connectionUuid });
    const reattach = useReattachLiveSource({ projectUuid, connectionUuid });
    const [picked, setPicked] = useState<string | null>(null);
    const inUseCount = data?.fields.filter(({ inUse }) => inUse).length ?? 0;
    const availableCount = (data?.fields.length ?? 0) - inUseCount;

    // A same-target source with charts is the likely reconnect, so it starts selected
    const selectedUuid =
        picked ??
        deletedSources.find(
            ({ isSameTarget, usedByChartCount }) =>
                isSameTarget && usedByChartCount > 0,
        )?.externalConnectionUuid ??
        NO_REATTACH;
    const selected = deletedSources.find(
        ({ externalConnectionUuid }) => externalConnectionUuid === selectedUuid,
    );

    const viewFields = () => {
        onClose();
        void navigate(getSemanticStudioSourceUrl(projectUuid, connectionUuid));
    };

    return (
        <MantineModal
            opened
            onClose={onClose}
            title="Connected · ready to query"
            icon={IconCircleCheck}
            cancelLabel="Done"
            cancelDisabled={reattach.isLoading}
            confirmLabel={selected ? 'Reattach' : 'View fields'}
            confirmLoading={reattach.isLoading}
            confirmDisabled={isLoadingDeleted}
            onConfirm={() => {
                if (!selected) {
                    viewFields();
                    return;
                }
                reattach.mutate(selected.externalConnectionUuid, {
                    onSuccess: viewFields,
                });
            }}
        >
            <Stack gap="sm">
                {data ? (
                    <Text fz="sm">
                        Using {inUseCount} default fields, so charts and AI
                        agents can query this source now.
                        {availableCount > 0 &&
                            ` ${availableCount} more are available to use from Fields.`}
                    </Text>
                ) : (
                    <Loader size="sm" />
                )}
                {deletedSources.length > 0 && (
                    <Select
                        allowDeselect={false}
                        label="Reattach a deleted source"
                        description="Its charts work again with this source, and its field edits come back."
                        value={selectedUuid}
                        onChange={setPicked}
                        data={[
                            { value: NO_REATTACH, label: "Don't reattach" },
                            ...deletedSources.map((source) => ({
                                value: source.externalConnectionUuid,
                                label: toOptionLabel(source),
                            })),
                        ]}
                    />
                )}
                {selected && !selected.isSameTarget && (
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
