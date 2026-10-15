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
    Tabs,
    Text,
    ThemeIcon,
} from '@mantine/core';
import {
    IconAppWindow,
    IconFolder,
    IconLink,
    IconUnlink,
    IconPuzzle,
    IconUser,
} from '@tabler/icons-react';
import { useState, type FC, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useExternalConnectionLinkedApps } from '../../../features/externalConnections/hooks/useExternalConnectionLinkedApps';
import { useUnlinkAppExternalConnection } from '../../../features/externalConnections/hooks/useUnlinkAppExternalConnection';
import MantineIcon from '../../common/MantineIcon';
import MantineModal from '../../common/MantineModal';
import classes from './ConnectionUsageModal.module.css';
import { LinkAppRow } from './LinkAppRow';

type Props = {
    opened: boolean;
    onClose: () => void;
    projectUuid: string;
    connection: ExternalConnectionListItem;
};

const UsageRow: FC<{
    projectUuid: string;
    item: ExternalConnectionLinkedApp;
    onUnlink: (item: ExternalConnectionLinkedApp) => void;
}> = ({ projectUuid, item, onUnlink }) => {
    const { t } = useTranslation('settings');
    const isDataApp = item.kind === 'data_app';
    const path = isDataApp
        ? `/projects/${projectUuid}/apps/${item.appUuid}`
        : `/projects/${projectUuid}/chart-studio/${item.appUuid}`;
    const displayName = getAppDisplayName(item.name, item.appUuid);

    return (
        <Box className={classes.resourceRow}>
            <Box
                component={Link}
                to={path}
                target="_blank"
                rel="noopener noreferrer"
                className={classes.resourceLink}
            >
                <ThemeIcon variant="light" size="lg" color="orange">
                    <MantineIcon
                        icon={isDataApp ? IconAppWindow : IconPuzzle}
                    />
                </ThemeIcon>

                <Stack gap={2} miw={0} flex={1}>
                    <Text fz="sm" fw={600} truncate>
                        {displayName}
                    </Text>
                    {isDataApp && (
                        <Group gap={4} wrap="wrap">
                            <MantineIcon
                                icon={item.spaceName ? IconFolder : IconUser}
                                size={14}
                                color="dimmed"
                            />
                            <Text fz="xs" c="dimmed">
                                {item.spaceName ??
                                    t('dataAppConnections.usage.personalApp')}
                            </Text>
                        </Group>
                    )}
                </Stack>
            </Box>
            <Button
                variant="subtle"
                color="red"
                size="compact-sm"
                leftSection={<MantineIcon icon={IconUnlink} size={14} />}
                onClick={() => onUnlink(item)}
                aria-label={t('dataAppConnections.usage.unlinkAria', {
                    name: displayName,
                })}
            >
                {t('dataAppConnections.usage.unlink')}
            </Button>
        </Box>
    );
};

const UsageList: FC<{
    items: ExternalConnectionLinkedApp[];
    projectUuid: string;
    onUnlink: (item: ExternalConnectionLinkedApp) => void;
    children?: ReactNode;
}> = ({ items, projectUuid, onUnlink, children }) => (
    <Stack gap={0}>
        {items.map((item) => (
            <UsageRow
                key={item.appUuid}
                projectUuid={projectUuid}
                item={item}
                onUnlink={onUnlink}
            />
        ))}
        {children}
    </Stack>
);

export const ConnectionUsageModal: FC<Props> = ({
    opened,
    onClose,
    projectUuid,
    connection,
}) => {
    const { t } = useTranslation('settings');
    const [pendingUnlink, setPendingUnlink] =
        useState<ExternalConnectionLinkedApp>();
    const { data, isLoading, isError, refetch } =
        useExternalConnectionLinkedApps(
            projectUuid,
            opened ? connection.externalConnectionUuid : undefined,
        );
    const { mutate: unlink, isLoading: isUnlinking } =
        useUnlinkAppExternalConnection();
    const dataApps =
        data?.items.filter((item) => item.kind === 'data_app') ?? [];
    const chartTypes =
        data?.items.filter((item) => item.kind === 'project_chart_type') ?? [];
    const handleConfirmUnlink = () => {
        if (!pendingUnlink) return;
        unlink(
            {
                projectUuid,
                appUuid: pendingUnlink.appUuid,
                aliases: pendingUnlink.aliases,
                name: connection.name,
            },
            { onSuccess: () => setPendingUnlink(undefined) },
        );
    };

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title={t('dataAppConnections.usage.title', {
                name: connection.name,
            })}
            subtitle={t('dataAppConnections.usage.subtitle', {
                origin: connection.origin,
            })}
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
                        {t('dataAppConnections.usage.loadError')}
                    </Text>
                    <Button
                        size="xs"
                        variant="default"
                        onClick={() => void refetch()}
                    >
                        {t('dataAppConnections.usage.tryAgain')}
                    </Button>
                </Stack>
            ) : (
                <Tabs
                    defaultValue={
                        dataApps.length === 0 && chartTypes.length > 0
                            ? 'chartTypes'
                            : 'dataApps'
                    }
                    keepMounted={false}
                >
                    <Tabs.List grow>
                        <Tabs.Tab value="dataApps">
                            {t('dataAppConnections.usage.dataAppsTab', {
                                count: dataApps.length,
                            })}
                        </Tabs.Tab>
                        <Tabs.Tab value="chartTypes">
                            {t('dataAppConnections.usage.chartTypesTab', {
                                count: chartTypes.length,
                            })}
                        </Tabs.Tab>
                    </Tabs.List>

                    <Tabs.Panel value="dataApps" pt="md">
                        <UsageList
                            items={dataApps}
                            projectUuid={projectUuid}
                            onUnlink={setPendingUnlink}
                        >
                            <LinkAppRow
                                kind="data_app"
                                projectUuid={projectUuid}
                                connection={connection}
                                linkedAppUuids={dataApps.map(
                                    (item) => item.appUuid,
                                )}
                            />
                        </UsageList>
                    </Tabs.Panel>

                    <Tabs.Panel value="chartTypes" pt="md">
                        <UsageList
                            items={chartTypes}
                            projectUuid={projectUuid}
                            onUnlink={setPendingUnlink}
                        >
                            <LinkAppRow
                                kind="project_chart_type"
                                projectUuid={projectUuid}
                                connection={connection}
                                linkedAppUuids={chartTypes.map(
                                    (item) => item.appUuid,
                                )}
                            />
                        </UsageList>
                    </Tabs.Panel>
                </Tabs>
            )}
            <MantineModal
                opened={pendingUnlink !== undefined}
                onClose={() => setPendingUnlink(undefined)}
                title={t('dataAppConnections.usage.unlinkConfirm.title', {
                    name: connection.name,
                })}
                variant="delete"
                icon={IconUnlink}
                size="md"
                description={t(
                    'dataAppConnections.usage.unlinkConfirm.description',
                )}
                confirmLabel={t(
                    'dataAppConnections.usage.unlinkConfirm.confirm',
                )}
                cancelLabel={t('dataAppConnections.usage.unlinkConfirm.cancel')}
                confirmLoading={isUnlinking}
                cancelDisabled={isUnlinking}
                onConfirm={handleConfirmUnlink}
            />
        </MantineModal>
    );
};
