import { type LiveSourceExploreFields } from '@lightdash/common';
import { ActionIcon, Box, Group, Switch, Text, Tooltip } from '@mantine/core';
import { IconPencil, IconTable } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import {
    useLiveSourceFields,
    useUpdateLiveSourceExplores,
} from '../externalConnections/hooks/useLiveSourceFields';
import { formatChartCount } from '../externalConnections/liveSources/liveSourceCatalog';
import { LiveSourceSwitchOffModal } from '../externalConnections/liveSources/LiveSourceSwitchOffModal';
import { LiveExploreDetailModal } from './FieldDetailModal';
import classes from './LiveExploresTable.module.css';
import { summaryOf } from './model';
import tableClasses from './WorkbenchMainPane.module.css';

/**
 * Every explore of a live data source, on or off. Switching one off stops
 * building it, so charts, dashboards and agents can't use it; it asks first
 * when saved charts use it.
 */
export const LiveExploresTable: FC<{
    projectUuid: string;
    connectionUuid: string;
    sourceName: string;
    onOpen: (exploreName: string) => void;
    /** Whether the explore is built and can be opened. */
    isOpenable: (exploreName: string) => boolean;
}> = ({ projectUuid, connectionUuid, sourceName, onOpen, isOpenable }) => {
    const params = { projectUuid, connectionUuid };
    const { data: fields } = useLiveSourceFields(params);
    const update = useUpdateLiveSourceExplores(params);
    const [confirming, setConfirming] =
        useState<LiveSourceExploreFields | null>(null);
    const [editing, setEditing] = useState<string | null>(null);
    if (!fields) return null;
    const switchExplore = (
        explore: LiveSourceExploreFields,
        inUse: boolean,
    ) => {
        if (!inUse && explore.usedByChartCount > 0) {
            setConfirming(explore);
            return;
        }
        update.mutate([{ exploreName: explore.exploreName, inUse }]);
    };
    const edited = fields.explores.find(
        ({ exploreName }) => exploreName === editing,
    );
    return (
        <>
            <Box className={tableClasses.table} aria-label="Explores">
                <Box className={classes.row} data-head>
                    <span>On</span>
                    <span>Name</span>
                    <span>Description</span>
                    <span className={tableClasses.alignRight}>Used by</span>
                    <span />
                </Box>
                {fields.explores.map((explore) => {
                    const openable =
                        explore.inUse && isOpenable(explore.exploreName);
                    return (
                        <Box
                            key={explore.exploreName}
                            className={classes.row}
                            data-off={!explore.inUse}
                        >
                            <Switch
                                size="xs"
                                aria-label={`${explore.label} on`}
                                checked={explore.inUse}
                                disabled={update.isLoading}
                                onChange={(event) =>
                                    switchExplore(
                                        explore,
                                        event.currentTarget.checked,
                                    )
                                }
                            />
                            <Group gap={10} wrap="nowrap" miw={0}>
                                <MantineIcon
                                    icon={IconTable}
                                    size={16}
                                    color="dimmed"
                                />
                                <Text
                                    truncate
                                    className={classes.name}
                                    data-openable={openable}
                                    title={explore.label}
                                    onClick={
                                        openable
                                            ? () => onOpen(explore.exploreName)
                                            : undefined
                                    }
                                >
                                    {explore.label}
                                </Text>
                            </Group>
                            <Text truncate className={classes.description}>
                                {explore.inUse
                                    ? summaryOf(explore.description)
                                    : 'Switched off'}
                            </Text>
                            <Text className={classes.count}>
                                {formatChartCount(explore.usedByChartCount)}
                            </Text>
                            <Tooltip label="Edit explore" withinPortal>
                                <ActionIcon
                                    variant="subtle"
                                    color="gray"
                                    size="sm"
                                    aria-label={`Edit ${explore.label}`}
                                    onClick={() =>
                                        setEditing(explore.exploreName)
                                    }
                                >
                                    <MantineIcon icon={IconPencil} size={14} />
                                </ActionIcon>
                            </Tooltip>
                        </Box>
                    );
                })}
            </Box>
            {confirming ? (
                <LiveSourceSwitchOffModal
                    projectUuid={projectUuid}
                    connectionUuid={connectionUuid}
                    exploreName={confirming.exploreName}
                    fieldName={null}
                    label={confirming.label}
                    isSaving={update.isLoading}
                    onConfirm={() =>
                        update.mutate(
                            [
                                {
                                    exploreName: confirming.exploreName,
                                    inUse: false,
                                },
                            ],
                            { onSuccess: () => setConfirming(null) },
                        )
                    }
                    onClose={() => setConfirming(null)}
                />
            ) : null}
            {edited ? (
                <LiveExploreDetailModal
                    projectUuid={projectUuid}
                    connectionUuid={connectionUuid}
                    sourceName={sourceName}
                    explore={edited}
                    icon={
                        <MantineIcon
                            icon={IconTable}
                            size={20}
                            color="dimmed"
                        />
                    }
                    onClose={() => setEditing(null)}
                />
            ) : null}
        </>
    );
};
