import { subject } from '@casl/ability';
import { WarehouseTypes } from '@lightdash/common';
import {
    Box,
    Loader,
    SimpleGrid,
    Stack,
    Text,
    UnstyledButton,
} from '@mantine/core';
import { captureException } from '@sentry/react';
import { IconChevronRight, IconUserPlus, type Icon } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { useNavigate } from 'react-router';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import { useEnsurePlaygroundProject } from '../../../hooks/useEnsurePlaygroundProject';
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
    icon: Icon;
    title: string;
    description: string;
    onClick: () => void;
}> = ({ icon, title, description, onClick }) => (
    <UnstyledButton className={classes.shortcut} onClick={onClick}>
        <Box className={classes.shortcutIcon}>
            <MantineIcon icon={icon} size={16} color="ldGray.7" />
        </Box>
        <Stack gap={0} className={classes.shortcutText}>
            <Text fw={500} size="sm">
                {title}
            </Text>
            <Text size="xs" c="dimmed">
                {description}
            </Text>
        </Stack>
        <MantineIcon icon={IconChevronRight} size={14} color="ldGray.5" />
    </UnstyledButton>
);

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
        onboardingNavigate(getWarehouseRoute(key));
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
                    icon={IconUserPlus}
                    title="Don't have the warehouse details?"
                    description="Invite your data engineer or analyst to connect it"
                    onClick={() => setIsInviteOpen(true)}
                />
            )}

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
