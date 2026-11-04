import { subject } from '@casl/ability';
import { ProjectType, WarehouseTypes } from '@lightdash/common';
import {
    Anchor,
    Box,
    Loader,
    SimpleGrid,
    Stack,
    Text,
    UnstyledButton,
} from '@mantine/core';
import { captureException } from '@sentry/react';
import { useState, type FC } from 'react';
import { useNavigate } from 'react-router';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import { useEnsurePlaygroundProject } from '../../../hooks/useEnsurePlaygroundProject';
import useApp from '../../../providers/App/useApp';
import useTracking from '../../../providers/Tracking/useTracking';
import LogoIcon from '../../../svgs/logo-icon.svg?react';
import { EventName } from '../../../types/Events';
import { useOnboardingNavigate } from '../../common/viewTransition';
import classes from './DataSourceChooser.module.css';
import { InviteTeammateModal } from './InviteTeammateModal';
import { LiveSourcesCard } from './LiveSourcesTeaser';
import { getPlaygroundSetupFailure } from './playgroundSetupFailure';
import { type SelectedWarehouse } from './types';
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

export const DataSourceChooser: FC = () => {
    const navigate = useNavigate();
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
            subject('Project', {
                organizationUuid,
                type: ProjectType.DEFAULT,
            }),
        ) === true;
    const canInvite =
        !!organizationUuid &&
        user.data?.ability?.can(
            'manage',
            subject('OrganizationMemberProfile', { organizationUuid }),
        ) === true;

    const openWarehouseForm = (warehouse: SelectedWarehouse) => {
        track({
            name: EventName.ONBOARDING_WAREHOUSE_SELECTED,
            properties: {
                organizationId: organizationUuid ?? null,
                warehouse: String(warehouse),
                tier: POPULAR.has(warehouse) ? 'popular' : 'all',
                onboardingFlow: 'new',
            },
        });
        onboardingNavigate(getWarehouseRoute(warehouse));
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
                properties: { organizationId: organizationUuid ?? null },
            });
            void navigate(`/projects/${projectUuid}/home`);
        } catch (error) {
            setIsOpeningSample(false);
            setHasFailed(true);
            track({
                name: EventName.PLAYGROUND_PROJECT_SETUP_FAILED,
                properties: {
                    organizationId: organizationUuid ?? null,
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
            {canUseSampleWorkspace && (
                <UnstyledButton
                    className={classes.tile}
                    disabled={isOpeningSample}
                    onClick={() => void openSampleWorkspace()}
                >
                    <Box className={classes.tileLogo}>
                        {isOpeningSample ? (
                            <Loader size={14} color="gray" />
                        ) : (
                            <LogoIcon width={14} height={14} />
                        )}
                    </Box>
                    <Box flex={1} miw={0}>
                        <Text fw={500} size="sm">
                            Try the demo project
                        </Text>
                        <Text c="dimmed" size="xs">
                            Explore sample data first, no setup needed
                        </Text>
                    </Box>
                </UnstyledButton>
            )}

            <Stack gap="xs">
                <Text fw={500} size="sm">
                    {canUseSampleWorkspace
                        ? 'Or connect where your data lives'
                        : 'Where does your data live?'}
                </Text>
                <SimpleGrid cols={{ base: 2, xs: 3 }} spacing="sm">
                    {WAREHOUSES.map((key) => (
                        <UnstyledButton
                            key={key}
                            className={classes.tile}
                            onClick={() => openWarehouseForm(key)}
                        >
                            <Box className={classes.tileLogo}>
                                {getWarehouseIcon(key, 'sm')}
                            </Box>
                            <Text
                                fw={500}
                                size="sm"
                                className={classes.tileLabel}
                            >
                                {getWarehouseLabel(key)}
                            </Text>
                        </UnstyledButton>
                    ))}
                </SimpleGrid>
            </Stack>

            {hasFailed && (
                <Text size="sm" c="red" role="alert">
                    We couldn't open the demo project. Try again, or connect a
                    warehouse.
                </Text>
            )}

            {canInvite && (
                <Text size="sm" c="dimmed">
                    Don't have the warehouse details?{' '}
                    <Anchor
                        component="button"
                        type="button"
                        inherit
                        onClick={() => setIsInviteOpen(true)}
                    >
                        Invite a teammate to connect it
                    </Anchor>
                </Text>
            )}

            <LiveSourcesCard />

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
