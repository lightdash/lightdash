import { subject } from '@casl/ability';
import { WarehouseTypes } from '@lightdash/common';
import {
    Box,
    Group,
    Image,
    Loader,
    Radio,
    SimpleGrid,
    Stack,
    Text,
    UnstyledButton,
} from '@mantine/core';
import { captureException } from '@sentry/react';
import { IconChevronRight, IconTable, IconUserPlus } from '@tabler/icons-react';
import { useState, type FC, type ReactNode } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import { useEnsurePlaygroundProject } from '../../../hooks/useEnsurePlaygroundProject';
import useApp from '../../../providers/App/useApp';
import useTracking from '../../../providers/Tracking/useTracking';
import LogoIcon from '../../../svgs/logo-icon.svg?react';
import { EventName } from '../../../types/Events';
import MantineIcon from '../../common/MantineIcon';
import {
    useOnboardingNavigate,
    withViewTransition,
} from '../../common/viewTransition';
import DbtLogo from './Assets/dbt.svg';
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

type DbtAnswer = 'yes' | 'no';
const DBT_PARAM = 'dbt';

const DbtQuestion: FC<{
    value: DbtAnswer | null;
    onChange: (value: DbtAnswer) => void;
}> = ({ value, onChange }) => (
    <Radio.Group
        label="Do you use dbt?"
        value={value}
        onChange={(next) => onChange(next === 'yes' ? 'yes' : 'no')}
        classNames={{ label: classes.questionLabel }}
    >
        <SimpleGrid cols={2} spacing="xs">
            <Radio.Card value="yes" className={classes.choiceCard}>
                <Group justify="space-between" align="flex-start">
                    <Box className={classes.tileLogo}>
                        <Image src={DbtLogo} alt="" w={18} h={18} />
                    </Box>
                    <Radio.Indicator size="xs" />
                </Group>
                <Text fw={500} size="sm" mt="sm">
                    Yes
                </Text>
                <Text c="dimmed" size="xs">
                    Bring your models from a repo or dbt Cloud
                </Text>
            </Radio.Card>
            <Radio.Card value="no" className={classes.choiceCard}>
                <Group justify="space-between" align="flex-start">
                    <Box className={classes.tileLogo}>
                        <MantineIcon icon={IconTable} size={18} />
                    </Box>
                    <Radio.Indicator size="xs" />
                </Group>
                <Text fw={500} size="sm" mt="sm">
                    No
                </Text>
                <Text c="dimmed" size="xs">
                    We'll draft models from your tables
                </Text>
            </Radio.Card>
        </SimpleGrid>
    </Radio.Group>
);

export const DataSourceChooser: FC = () => {
    const navigate = useNavigate();
    const { search } = useLocation();
    const [searchParams, setSearchParams] = useSearchParams();
    const dbtParam = searchParams.get(DBT_PARAM);
    const usesDbt: DbtAnswer | null =
        dbtParam === 'yes' || dbtParam === 'no' ? dbtParam : null;
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
        const withRepo = usesDbt === 'yes' && key !== OtherWarehouse.Other;
        onboardingNavigate(
            `${getWarehouseRoute(key)}${withRepo ? '/repo' : ''}${search}`,
        );
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
            <DbtQuestion
                value={usesDbt}
                onChange={(value) =>
                    withViewTransition(() =>
                        setSearchParams(
                            (params) => {
                                params.set(DBT_PARAM, value);
                                return params;
                            },
                            { replace: true },
                        ),
                    )
                }
            />
            {usesDbt && (
                <Stack gap="xs">
                    <Text size="sm" fw={500}>
                        Where does your data live?
                    </Text>
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
                                <Text
                                    fw={500}
                                    size="sm"
                                    className={classes.tileLabel}
                                >
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
                                <Text
                                    fw={500}
                                    size="sm"
                                    className={classes.tileLabel}
                                >
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
                                onClick={() =>
                                    selectWarehouse(OtherWarehouse.Other)
                                }
                            >
                                <Box className={classes.tileLogo}>
                                    {getWarehouseIcon(
                                        OtherWarehouse.Other,
                                        'sm',
                                    )}
                                </Box>
                                <Text
                                    fw={500}
                                    size="sm"
                                    className={classes.tileLabel}
                                >
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
                </Stack>
            )}

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
