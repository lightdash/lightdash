import { type ApiConnectorType } from '@lightdash/common';
import {
    Badge,
    Button,
    Group,
    SimpleGrid,
    Stack,
    Text,
    UnstyledButton,
} from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import {
    isAvailableLiveSource,
    LIVE_SOURCE_CATALOG,
    type LiveSourceCatalogEntry,
} from '../../../features/externalConnections/liveSources/liveSourceCatalog';
import useApp from '../../../providers/App/useApp';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import MantineIcon from '../../common/MantineIcon';
import MantineModal from '../../common/MantineModal';
import styles from './AddLiveSourceModal.module.css';
import { isGoogleConnector } from './googleConnection';

type Props = {
    opened: boolean;
    onClose: () => void;
    projectUuid: string;
    canUseGoogle: boolean;
    onPick: (connector: ApiConnectorType) => void;
};

const CardHead: FC<{ entry: LiveSourceCatalogEntry }> = ({ entry }) => (
    <Group gap="sm" wrap="nowrap" align="flex-start">
        <img src={entry.icon} alt="" className={styles.icon} />
        <Stack gap={2} miw={0}>
            <Text fw={600} fz="sm" truncate>
                {entry.label}
            </Text>
            <Text fz="xs" c="dimmed" lineClamp={2}>
                {entry.description}
            </Text>
        </Stack>
    </Group>
);

export const AddLiveSourceModal: FC<Props> = ({
    opened,
    onClose,
    projectUuid,
    canUseGoogle,
    onPick,
}) => {
    const { user } = useApp();
    const { track } = useTracking();
    const [requested, setRequested] = useState<ReadonlySet<string>>(new Set());
    // Google sources need the instance's Google sign-in configured.
    const entries = LIVE_SOURCE_CATALOG.filter(
        (entry) =>
            !isAvailableLiveSource(entry) ||
            canUseGoogle ||
            !isGoogleConnector(entry.connector),
    );

    const request = (entry: LiveSourceCatalogEntry) => {
        track({
            name: EventName.LIVE_DATA_SOURCE_REQUESTED,
            properties: {
                organizationId: user.data?.organizationUuid ?? null,
                projectId: projectUuid,
                integration: entry.id,
            },
        });
        setRequested((current) => new Set(current).add(entry.id));
    };

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Add a live data source"
            subtitle="AI agents query it live, without loading data into your warehouse."
            size="xl"
            cancelLabel={false}
        >
            <SimpleGrid cols={{ base: 1, xs: 2, sm: 3 }} spacing="sm">
                {entries.map((entry) =>
                    isAvailableLiveSource(entry) ? (
                        <UnstyledButton
                            key={entry.id}
                            className={styles.card}
                            onClick={() => onPick(entry.connector)}
                        >
                            <CardHead entry={entry} />
                        </UnstyledButton>
                    ) : (
                        <Stack
                            key={entry.id}
                            className={styles.card}
                            data-requestable
                            justify="space-between"
                            gap="sm"
                        >
                            <CardHead entry={entry} />
                            <Group justify="space-between" wrap="nowrap">
                                <Badge
                                    variant="light"
                                    color="gray"
                                    size="sm"
                                    radius="sm"
                                >
                                    Coming soon
                                </Badge>
                                {requested.has(entry.id) ? (
                                    <Group gap={4} wrap="nowrap">
                                        <MantineIcon
                                            icon={IconCheck}
                                            size={14}
                                            color="green"
                                        />
                                        <Text fz="xs" c="dimmed">
                                            Requested
                                        </Text>
                                    </Group>
                                ) : (
                                    <Button
                                        size="compact-xs"
                                        variant="default"
                                        onClick={() => request(entry)}
                                    >
                                        Request
                                    </Button>
                                )}
                            </Group>
                        </Stack>
                    ),
                )}
            </SimpleGrid>
        </MantineModal>
    );
};
