import {
    getAppDisplayName,
    type ExternalConnectionLinkedApp,
    type ExternalConnectionListItem,
} from '@lightdash/common';
import {
    Box,
    Button,
    Group,
    Skeleton,
    Stack,
    Text,
    ThemeIcon,
    Title,
} from '@mantine/core';
import {
    IconAppWindow,
    IconFolder,
    IconLink,
    IconPuzzle,
    IconUser,
} from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import { useExternalConnectionLinkedApps } from '../../../features/externalConnections/hooks/useExternalConnectionLinkedApps';
import MantineIcon from '../../common/MantineIcon';
import MantineModal from '../../common/MantineModal';
import classes from './ConnectionUsageModal.module.css';

type Props = {
    opened: boolean;
    onClose: () => void;
    projectUuid: string;
    connection: ExternalConnectionListItem;
};

const UsageRow: FC<{
    projectUuid: string;
    item: ExternalConnectionLinkedApp;
}> = ({ projectUuid, item }) => {
    const isDataApp = item.kind === 'data_app';
    const path = isDataApp
        ? `/projects/${projectUuid}/apps/${item.appUuid}`
        : `/projects/${projectUuid}/chart-types/${item.appUuid}`;

    return (
        <Box
            component={Link}
            to={path}
            target="_blank"
            rel="noopener noreferrer"
            className={classes.resourceRow}
        >
            <ThemeIcon variant="light" size="lg" color="orange">
                <MantineIcon icon={isDataApp ? IconAppWindow : IconPuzzle} />
            </ThemeIcon>

            <Stack gap={2} miw={0} flex={1}>
                <Text fz="sm" fw={600} truncate>
                    {getAppDisplayName(item.name, item.appUuid)}
                </Text>
                {isDataApp && (
                    <Group gap={4} wrap="wrap">
                        <MantineIcon
                            icon={item.spaceName ? IconFolder : IconUser}
                            size={14}
                            color="ldGray.6"
                        />
                        <Text fz="xs" c="ldGray.6">
                            {item.spaceName ?? 'Personal app'}
                        </Text>
                    </Group>
                )}
            </Stack>
        </Box>
    );
};

const UsageSection: FC<{
    title: string;
    items: ExternalConnectionLinkedApp[];
    projectUuid: string;
}> = ({ title, items, projectUuid }) => (
    <Stack gap="xs">
        <Group gap="xs">
            <Title order={6}>{title}</Title>
            <Text fz="xs" c="ldGray.6">
                {items.length}
            </Text>
        </Group>
        <Stack gap={0}>
            {items.map((item) => (
                <UsageRow
                    key={item.appUuid}
                    projectUuid={projectUuid}
                    item={item}
                />
            ))}
        </Stack>
    </Stack>
);

export const ConnectionUsageModal: FC<Props> = ({
    opened,
    onClose,
    projectUuid,
    connection,
}) => {
    const { data, isLoading, isError, refetch } =
        useExternalConnectionLinkedApps(
            projectUuid,
            opened ? connection.externalConnectionUuid : undefined,
        );
    const dataApps =
        data?.items.filter((item) => item.kind === 'data_app') ?? [];
    const chartTypes =
        data?.items.filter((item) => item.kind === 'project_chart_type') ?? [];

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title={`Linked to “${connection.name}”`}
            subtitle={`Linked resources can send data to ${connection.origin}`}
            icon={IconLink}
            cancelLabel={false}
            size="lg"
        >
            {isLoading ? (
                <Stack gap="xs">
                    <Skeleton height={64} />
                    <Skeleton height={64} />
                    <Skeleton height={64} />
                </Stack>
            ) : isError ? (
                <Stack align="center" gap="sm" py="xl">
                    <Text fz="sm" c="red">
                        Could not load the apps using this connection.
                    </Text>
                    <Button
                        size="xs"
                        variant="default"
                        onClick={() => void refetch()}
                    >
                        Try again
                    </Button>
                </Stack>
            ) : (data?.total ?? 0) === 0 ? (
                <Stack align="center" gap="xs" py="xl">
                    <Text fz="sm" fw={600}>
                        No linked apps
                    </Text>
                    <Text fz="sm" c="ldGray.6" ta="center">
                        No data apps or chart types are linked to this
                        connection yet.
                    </Text>
                </Stack>
            ) : (
                <Stack gap="lg">
                    {dataApps.length > 0 && (
                        <UsageSection
                            title="Data apps"
                            items={dataApps}
                            projectUuid={projectUuid}
                        />
                    )}
                    {chartTypes.length > 0 && (
                        <UsageSection
                            title="Chart types"
                            items={chartTypes}
                            projectUuid={projectUuid}
                        />
                    )}
                </Stack>
            )}
        </MantineModal>
    );
};
