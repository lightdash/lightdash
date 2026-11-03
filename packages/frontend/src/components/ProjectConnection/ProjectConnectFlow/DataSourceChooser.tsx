import { subject } from '@casl/ability';
import {
    ApiConnectorType,
    FeatureFlags,
    WarehouseTypes,
} from '@lightdash/common';
import {
    Box,
    Group,
    Image,
    Loader,
    SimpleGrid,
    Stack,
    Text,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import { captureException } from '@sentry/react';
import { IconCheck, IconChevronRight, IconUserPlus } from '@tabler/icons-react';
import { useState, type FC, type ReactNode } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import {
    isAvailableLiveSource,
    LIVE_SOURCE_CATALOG,
    type AvailableLiveSource,
} from '../../../features/externalConnections/liveSources/liveSourceCatalog';
import { LiveSourceIcon } from '../../../features/externalConnections/liveSources/LiveSourceIcon';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import { useEnsurePlaygroundProject } from '../../../hooks/useEnsurePlaygroundProject';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../../providers/App/useApp';
import useTracking from '../../../providers/Tracking/useTracking';
import LogoIcon from '../../../svgs/logo-icon.svg?react';
import { EventName } from '../../../types/Events';
import MantineIcon from '../../common/MantineIcon';
import { useOnboardingNavigate } from '../../common/viewTransition';
import classes from './DataSourceChooser.module.css';
import { InviteTeammateModal } from './InviteTeammateModal';
import { getPlaygroundSetupFailure } from './playgroundSetupFailure';
import { OtherWarehouse, type SelectedWarehouse } from './types';
import {
    getWarehouseIcon,
    getWarehouseLabel,
    getWarehouseRoute,
} from './utils';

const WAREHOUSES: SelectedWarehouse[] = [
    WarehouseTypes.BIGQUERY,
    WarehouseTypes.SNOWFLAKE,
    WarehouseTypes.DATABRICKS,
    WarehouseTypes.POSTGRES,
    WarehouseTypes.REDSHIFT,
    WarehouseTypes.CLICKHOUSE,
    WarehouseTypes.ATHENA,
    WarehouseTypes.TRINO,
    WarehouseTypes.DUCKDB,
];

const POPULAR = new Set<SelectedWarehouse>(WAREHOUSES.slice(0, 4));

const ShortcutCard: FC<{
    icon: ReactNode;
    title: string;
    description: string;
    onClick: () => void;
    primary?: boolean;
}> = ({ icon, title, description, onClick, primary = false }) => (
    <UnstyledButton
        className={classes.shortcut}
        data-primary={primary}
        onClick={onClick}
    >
        <Box className={classes.shortcutIcon}>{icon}</Box>
        <Stack gap={0} className={classes.shortcutText}>
            <Text fw={500} size="sm">
                {title}
            </Text>
            <Text size="xs" className={classes.shortcutDescription}>
                {description}
            </Text>
        </Stack>
        <MantineIcon icon={IconChevronRight} size={14} color="ldGray.5" />
    </UnstyledButton>
);

// Read by the tools step, which opens the first picked source after setup
const THEN_PARAM = 'then';

const SourceTile: FC<{
    source: AvailableLiveSource;
    isPicked: boolean;
    onClick: () => void;
}> = ({ source, isPicked, onClick }) => (
    <UnstyledButton
        className={classes.catalogTile}
        data-active={isPicked}
        onClick={onClick}
    >
        <Box className={classes.tileLogo}>
            <LiveSourceIcon connector={source.connector} size={16} />
        </Box>
        <Stack gap={0} miw={0}>
            <Text fw={500} size="sm" lh={1.3}>
                {source.label}
            </Text>
            {isPicked && (
                <Text size="xs" c="dimmed" truncate>
                    Next up
                </Text>
            )}
        </Stack>
        {isPicked && (
            <MantineIcon
                icon={IconCheck}
                size={14}
                className={classes.catalogCheck}
            />
        )}
    </UnstyledButton>
);

const LiveSourceCatalog: FC = () => {
    const { health } = useApp();
    const [searchParams, setSearchParams] = useSearchParams();
    const liveSourcesFlag = useServerFeatureFlag(FeatureFlags.ApiQuerySources);

    if (!liveSourcesFlag.data?.enabled) return null;

    const available = LIVE_SOURCE_CATALOG.filter(isAvailableLiveSource).filter(
        ({ connector }) =>
            connector === ApiConnectorType.POSTHOG ||
            health.data?.hasGoogleLiveSources === true,
    );
    const comingSoon = LIVE_SOURCE_CATALOG.filter(
        (entry) => !isAvailableLiveSource(entry),
    );

    const picked = new Set(
        (searchParams.get(THEN_PARAM) ?? '').split(',').filter(Boolean),
    );
    const togglePicked = (id: string) => {
        const next = new Set(picked);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSearchParams(
            (params) => {
                if (next.size === 0) params.delete(THEN_PARAM);
                else params.set(THEN_PARAM, [...next].join(','));
                return params;
            },
            { replace: true },
        );
    };

    return (
        <Stack gap="xs">
            <Stack gap={0}>
                <Text size="sm" fw={500}>
                    Also bring in live data
                </Text>
                <Text size="xs" c="dimmed">
                    Pick any to connect right after your warehouse
                </Text>
            </Stack>
            <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="xs">
                {available.map((source) => (
                    <SourceTile
                        key={source.connector}
                        source={source}
                        isPicked={picked.has(source.connector)}
                        onClick={() => togglePicked(source.connector)}
                    />
                ))}
            </SimpleGrid>
            <Group gap={6} wrap="wrap" justify="flex-end">
                <Text size="xs" c="dimmed">
                    Coming soon
                </Text>
                {comingSoon.map((entry) => (
                    <Tooltip key={entry.id} label={entry.label} withinPortal>
                        <Image
                            src={entry.icon}
                            alt={entry.label}
                            w={14}
                            h={14}
                            fit="contain"
                            className={classes.comingSoonIcon}
                        />
                    </Tooltip>
                ))}
            </Group>
        </Stack>
    );
};

export const DataSourceChooser: FC = () => {
    const navigate = useNavigate();
    const { search } = useLocation();
    const onboardingNavigate = useOnboardingNavigate();
    const { health, user } = useApp();
    const { track } = useTracking();
    const { data: organization } = useOrganization();
    const ensurePlayground = useEnsurePlaygroundProject();
    const [isOpeningSample, setIsOpeningSample] = useState(false);
    const [hasFailed, setHasFailed] = useState(false);
    const [isInviteOpen, setIsInviteOpen] = useState(false);

    const organizationUuid = organization?.organizationUuid;
    const canUseSampleWorkspace =
        health.data?.hasPlaygroundProjects === true &&
        !!organizationUuid &&
        user.data?.ability?.can(
            'create',
            subject('InviteLink', { organizationUuid }),
        ) === true;
    const canInvite =
        !!organizationUuid &&
        user.data?.ability?.can(
            'manage',
            subject('OrganizationMemberProfile', { organizationUuid }),
        ) === true;

    const selectWarehouse = (key: SelectedWarehouse) => {
        track({
            name: EventName.ONBOARDING_WAREHOUSE_SELECTED,
            properties: {
                organizationId: organizationUuid ?? null,
                warehouse: String(key),
                tier:
                    key === OtherWarehouse.Other
                        ? 'other'
                        : POPULAR.has(key)
                          ? 'popular'
                          : 'all',
                onboardingFlow: 'new',
            },
        });
        onboardingNavigate(`${getWarehouseRoute(key)}${search}`);
    };

    const openSampleWorkspace = async () => {
        setIsOpeningSample(true);
        setHasFailed(false);
        try {
            const { projectUuid } = await ensurePlayground.mutateAsync({
                trigger: 'get_started',
            });
            track({
                name: EventName.PLAYGROUND_PROJECT_ENTERED,
                properties: { organizationId: organizationUuid ?? '' },
            });
            void navigate(`/projects/${projectUuid}/home`);
        } catch (error) {
            setIsOpeningSample(false);
            setHasFailed(true);
            track({
                name: EventName.PLAYGROUND_PROJECT_SETUP_FAILED,
                properties: {
                    organizationId: organizationUuid ?? '',
                    failureType: getPlaygroundSetupFailure(error),
                },
            });
            captureException(error, {
                tags: { feature: 'data-source-chooser' },
            });
        }
    };

    return (
        <Stack gap="xl">
            <SimpleGrid cols={2} spacing="sm">
                {WAREHOUSES.map((key) => (
                    <UnstyledButton
                        key={key}
                        className={classes.tile}
                        onClick={() => selectWarehouse(key)}
                    >
                        <Box className={classes.tileLogo}>
                            {getWarehouseIcon(key, 'sm')}
                        </Box>
                        <Text fw={500} size="sm" className={classes.tileLabel}>
                            {getWarehouseLabel(key)}
                        </Text>
                        <MantineIcon
                            icon={IconChevronRight}
                            size={14}
                            color="ldGray.5"
                        />
                    </UnstyledButton>
                ))}
                {canUseSampleWorkspace ? (
                    <UnstyledButton
                        className={classes.tile}
                        disabled={isOpeningSample}
                        onClick={() => void openSampleWorkspace()}
                    >
                        <Box className={classes.tileLogo}>
                            {isOpeningSample ? (
                                <Loader size={14} />
                            ) : (
                                <LogoIcon width={18} height={18} />
                            )}
                        </Box>
                        <Text fw={500} size="sm" className={classes.tileLabel}>
                            Try our demo project
                        </Text>
                        <MantineIcon
                            icon={IconChevronRight}
                            size={14}
                            color="ldGray.5"
                        />
                    </UnstyledButton>
                ) : (
                    <UnstyledButton
                        className={classes.tile}
                        onClick={() => selectWarehouse(OtherWarehouse.Other)}
                    >
                        <Box className={classes.tileLogo}>
                            {getWarehouseIcon(OtherWarehouse.Other, 'sm')}
                        </Box>
                        <Text fw={500} size="sm" className={classes.tileLabel}>
                            {getWarehouseLabel(OtherWarehouse.Other)}
                        </Text>
                        <MantineIcon
                            icon={IconChevronRight}
                            size={14}
                            color="ldGray.5"
                        />
                    </UnstyledButton>
                )}
            </SimpleGrid>

            {hasFailed && (
                <Text size="sm" c="red" role="alert">
                    We couldn't prepare the sample data. Try again, or connect a
                    warehouse.
                </Text>
            )}

            {canInvite && (
                <ShortcutCard
                    icon={
                        <MantineIcon
                            icon={IconUserPlus}
                            size={16}
                            color="ldGray.7"
                        />
                    }
                    title="Don't have the warehouse details?"
                    description="Invite your data engineer or analyst to connect it"
                    onClick={() => setIsInviteOpen(true)}
                />
            )}

            <LiveSourceCatalog />

            {canInvite && (
                <InviteTeammateModal
                    opened={isInviteOpen}
                    onClose={() => setIsInviteOpen(false)}
                    organizationUuid={organizationUuid}
                />
            )}
        </Stack>
    );
};
