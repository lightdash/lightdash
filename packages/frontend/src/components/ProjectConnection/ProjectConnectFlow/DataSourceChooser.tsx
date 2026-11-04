import { subject } from '@casl/ability';
import { ProjectType, WarehouseTypes } from '@lightdash/common';
import {
    Anchor,
    Box,
    Button,
    Group,
    Image,
    Radio,
    SimpleGrid,
    Stack,
    Text,
} from '@mantine/core';
import { captureException } from '@sentry/react';
import { IconTable } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import { useEnsurePlaygroundProject } from '../../../hooks/useEnsurePlaygroundProject';
import useApp from '../../../providers/App/useApp';
import useTracking from '../../../providers/Tracking/useTracking';
import LogoIcon from '../../../svgs/logo-icon.svg?react';
import { EventName } from '../../../types/Events';
import MantineIcon from '../../common/MantineIcon';
import { useOnboardingNavigate } from '../../common/viewTransition';
import DbtLogo from './Assets/dbt.svg';
import classes from './DataSourceChooser.module.css';
import { InviteTeammateModal } from './InviteTeammateModal';
import { LiveSourcesCard } from './LiveSourcesTeaser';
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
const CHOICES: SelectedWarehouse[] = [...WAREHOUSES, OtherWarehouse.Other];

const DBT_PARAM = 'dbt';
const WAREHOUSE_PARAM = 'warehouse';

type DbtAnswer = 'yes' | 'no';

const ModelSourceQuestion: FC<{
    value: DbtAnswer | null;
    onChange: (value: DbtAnswer) => void;
}> = ({ value, onChange }) => (
    <Radio.Group
        label="How should we set up your models?"
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
                    From my dbt project
                </Text>
                <Text c="dimmed" size="xs">
                    Bring models from a repo or dbt Cloud
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
                    From my tables
                </Text>
                <Text c="dimmed" size="xs">
                    We'll draft models for you to review
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
    const warehouse =
        CHOICES.find((key) => key === searchParams.get(WAREHOUSE_PARAM)) ??
        null;
    const isOtherWarehouse = warehouse === OtherWarehouse.Other;
    const canContinue = !!warehouse && (isOtherWarehouse || !!usesDbt);
    const onboardingNavigate = useOnboardingNavigate();
    const { health, user } = useApp();
    const { track } = useTracking();
    const { data: organization } = useOrganization();
    const ensurePlayground = useEnsurePlaygroundProject();
    const [isOpeningSample, setIsOpeningSample] = useState(false);
    const [hasFailed, setHasFailed] = useState(false);
    const [isInviteOpen, setIsInviteOpen] = useState(false);

    // Kept in the URL so Back from the form restores both choices
    const setParam = (key: string, value: string) =>
        setSearchParams(
            (params) => {
                params.set(key, value);
                return params;
            },
            { replace: true },
        );

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

    const continueToForm = () => {
        if (!warehouse || !canContinue) return;
        track({
            name: EventName.ONBOARDING_WAREHOUSE_SELECTED,
            properties: {
                organizationId: organizationUuid ?? null,
                warehouse: String(warehouse),
                tier: isOtherWarehouse
                    ? 'other'
                    : POPULAR.has(warehouse)
                      ? 'popular'
                      : 'all',
                onboardingFlow: 'new',
            },
        });
        const withRepo = usesDbt === 'yes' && !isOtherWarehouse;
        onboardingNavigate(
            `${getWarehouseRoute(warehouse)}${withRepo ? '/repo' : ''}${search}`,
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
            <Radio.Group
                label="Where does your data live?"
                value={warehouse}
                onChange={(next) => setParam(WAREHOUSE_PARAM, next)}
                classNames={{ label: classes.questionLabel }}
            >
                <SimpleGrid cols={2} spacing="sm">
                    {CHOICES.map((key) => (
                        <Radio.Card
                            key={key}
                            value={key}
                            className={classes.tile}
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
                            <Radio.Indicator size="xs" />
                        </Radio.Card>
                    ))}
                </SimpleGrid>
            </Radio.Group>

            {!isOtherWarehouse && (
                <ModelSourceQuestion
                    value={usesDbt}
                    onChange={(value) => setParam(DBT_PARAM, value)}
                />
            )}

            <Group justify="space-between">
                {canUseSampleWorkspace ? (
                    <Button
                        variant="subtle"
                        color="gray"
                        px={0}
                        loading={isOpeningSample}
                        leftSection={<LogoIcon width={14} height={14} />}
                        onClick={() => void openSampleWorkspace()}
                    >
                        Try the demo project
                    </Button>
                ) : (
                    <Box />
                )}
                <Button disabled={!canContinue} onClick={continueToForm}>
                    Continue
                </Button>
            </Group>

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
