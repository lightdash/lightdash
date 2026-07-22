import { subject } from '@casl/ability';
import { ProjectType, WarehouseTypes } from '@lightdash/common';
import {
    Box,
    Group,
    Paper,
    SimpleGrid,
    Stack,
    Text,
    Title,
} from '@mantine-8/core';
import { type FC } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import AboutFooter from '../components/AboutFooter';
import { DocumentTitle } from '../components/common/DocumentTitle';
import ErrorState from '../components/common/ErrorState';
import PageSpinner from '../components/PageSpinner';
import ConnectManuallyStep2 from '../components/ProjectConnection/ProjectConnectFlow/ConnectManually/ConnectManuallyStep2';
import InviteExpertFooter from '../components/ProjectConnection/ProjectConnectFlow/InviteExpertFooter';
import {
    OtherWarehouse,
    type SelectedWarehouse,
} from '../components/ProjectConnection/ProjectConnectFlow/types';
import UnsupportedWarehouse from '../components/ProjectConnection/ProjectConnectFlow/UnsupportedWarehouse';
import {
    getWarehouseIcon,
    WarehouseTypeLabels,
} from '../components/ProjectConnection/ProjectConnectFlow/utils';
import { ProjectFormProvider } from '../components/ProjectConnection/ProjectFormProvider';
import { useOrganization } from '../hooks/organization/useOrganization';
import { useOnboardingPageGuard } from '../hooks/useOnboardingPageGuard';
import useApp from '../providers/App/useApp';
import useTracking from '../providers/Tracking/useTracking';
import { EventName } from '../types/Events';
import classes from './OnboardingDataSource.module.css';

const WAREHOUSE_ORDER = [
    WarehouseTypes.BIGQUERY,
    WarehouseTypes.SNOWFLAKE,
    WarehouseTypes.DATABRICKS,
    WarehouseTypes.POSTGRES,
    WarehouseTypes.REDSHIFT,
    WarehouseTypes.CLICKHOUSE,
    WarehouseTypes.ATHENA,
    WarehouseTypes.TRINO,
    WarehouseTypes.DUCKDB,
    OtherWarehouse.Other,
];

const orderedWarehouses = WAREHOUSE_ORDER.map((key) =>
    WarehouseTypeLabels.find((warehouse) => warehouse.key === key),
).filter((warehouse) => warehouse !== undefined);

const POPULAR_WAREHOUSES: { key: WarehouseTypes; subtitle: string }[] = [
    {
        key: WarehouseTypes.BIGQUERY,
        subtitle: 'Sign in with Google to connect',
    },
    {
        key: WarehouseTypes.SNOWFLAKE,
        subtitle: 'Connect with SSO',
    },
];

const popularKeys: SelectedWarehouse[] = POPULAR_WAREHOUSES.map(
    (warehouse) => warehouse.key,
);

const BIGQUERY_SERVICE_ACCOUNT_SUBTITLE = 'Connect with a service account';

const getPopularWarehouses = (isGoogleSsoAvailable: boolean) =>
    POPULAR_WAREHOUSES.map(({ key, subtitle }) => {
        const label = WarehouseTypeLabels.find(
            (warehouse) => warehouse.key === key,
        )?.label;
        if (!label) {
            return undefined;
        }
        return {
            key,
            label,
            subtitle:
                key === WarehouseTypes.BIGQUERY && !isGoogleSsoAvailable
                    ? BIGQUERY_SERVICE_ACCOUNT_SUBTITLE
                    : subtitle,
        };
    }).filter((warehouse) => warehouse !== undefined);

const allWarehouses = orderedWarehouses.filter(
    (warehouse) => !popularKeys.includes(warehouse.key),
);

const OTHER_ROUTE_PARAM = 'other';

const isWarehouseType = (value: string): value is WarehouseTypes =>
    Object.values(WarehouseTypes).includes(value as WarehouseTypes);

const getWarehouseRoute = (key: SelectedWarehouse) =>
    `/onboarding/data-source/${
        key === OtherWarehouse.Other ? OTHER_ROUTE_PARAM : key
    }`;

const SectionHeader: FC<{ title: string; hint?: string }> = ({
    title,
    hint,
}) => (
    <Group justify="space-between" align="baseline">
        <Text size="xs" fw={600} c="dimmed" tt="uppercase" lts={0.5}>
            {title}
        </Text>
        {hint && (
            <Text size="sm" c="dimmed">
                {hint}
            </Text>
        )}
    </Group>
);

const DataSourcePicker: FC = () => {
    const navigate = useNavigate();
    const { track } = useTracking();
    const { health } = useApp();
    const popularWarehouses = getPopularWarehouses(
        health.data?.auth.google.enabled ?? false,
    );

    const handleSelect = (
        key: SelectedWarehouse,
        tier: 'popular' | 'all' | 'other',
    ) => {
        track({
            name: EventName.ONBOARDING_WAREHOUSE_SELECTED,
            properties: { warehouse: String(key), tier },
        });
        void navigate(getWarehouseRoute(key));
    };

    return (
        <Box className={classes.column}>
            <Stack align="center" gap="xs">
                <Title order={1} ta="center" fw={700}>
                    Add a data source
                </Title>
                <Text size="md" c="dimmed" ta="center">
                    Connect your warehouse so your agents can query your data.
                </Text>
            </Stack>

            <Stack gap="md">
                <SectionHeader title="Most popular" />
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                    {popularWarehouses.map((warehouse) => (
                        <Paper
                            key={warehouse.key}
                            withBorder
                            radius="md"
                            className={`${classes.heroCard} ${classes.warehouseCardEnabled}`}
                            onClick={() =>
                                handleSelect(warehouse.key, 'popular')
                            }
                        >
                            <Box>{getWarehouseIcon(warehouse.key, 48)}</Box>
                            <Stack gap={2}>
                                <Text className={classes.heroName}>
                                    {warehouse.label}
                                </Text>
                                <Text size="sm" c="dimmed">
                                    {warehouse.subtitle}
                                </Text>
                            </Stack>
                        </Paper>
                    ))}
                </SimpleGrid>
            </Stack>

            <Stack gap="md">
                <SectionHeader title="All warehouses" />
                <SimpleGrid cols={{ base: 2, sm: 3, md: 4 }} spacing="md">
                    {allWarehouses.map((warehouse) => (
                        <Paper
                            key={warehouse.key}
                            withBorder
                            radius="md"
                            className={`${classes.warehouseCard} ${classes.warehouseCardEnabled}`}
                            onClick={() =>
                                handleSelect(
                                    warehouse.key,
                                    warehouse.key === OtherWarehouse.Other
                                        ? 'other'
                                        : 'all',
                                )
                            }
                        >
                            <Box>{getWarehouseIcon(warehouse.key, 40)}</Box>
                            <Text className={classes.warehouseLabel}>
                                {warehouse.label}
                            </Text>
                        </Paper>
                    ))}
                </SimpleGrid>
            </Stack>

            <InviteExpertFooter />
        </Box>
    );
};

const WarehouseConnect: FC<{ selectedWarehouse: WarehouseTypes }> = ({
    selectedWarehouse,
}) => {
    const navigate = useNavigate();
    const {
        isInitialLoading: isLoadingOrganization,
        data: organization,
        error: organizationError,
    } = useOrganization();

    if (isLoadingOrganization) {
        return <PageSpinner />;
    }

    if (organizationError || !organization) {
        return <ErrorState error={organizationError?.error} />;
    }

    return (
        <Box className={classes.connectColumn}>
            <ProjectFormProvider>
                <ConnectManuallyStep2
                    isCreatingFirstProject={!!organization.needsProject}
                    selectedWarehouse={selectedWarehouse}
                    warehouseOnly
                    onBack={() => void navigate('/onboarding/data-source')}
                    successRedirect={(projectUuid) =>
                        `/onboarding/project-ready/${projectUuid}`
                    }
                />
            </ProjectFormProvider>
        </Box>
    );
};

const OtherWarehouseConnect: FC = () => {
    const navigate = useNavigate();

    return (
        <Box className={classes.connectColumn}>
            <UnsupportedWarehouse
                onBack={() => void navigate('/onboarding/data-source')}
            />
        </Box>
    );
};

const OnboardingDataSourceContent: FC = () => {
    const { warehouse } = useParams<{ warehouse?: string }>();

    const selectedWarehouse =
        warehouse && isWarehouseType(warehouse) ? warehouse : undefined;

    if (warehouse && !selectedWarehouse && warehouse !== OTHER_ROUTE_PARAM) {
        return <Navigate to="/onboarding/data-source" replace />;
    }

    return (
        <Box className={classes.page}>
            <DocumentTitle title="Add a data source" />
            {selectedWarehouse ? (
                <WarehouseConnect selectedWarehouse={selectedWarehouse} />
            ) : warehouse === OTHER_ROUTE_PARAM ? (
                <OtherWarehouseConnect />
            ) : (
                <DataSourcePicker />
            )}

            <AboutFooter />
        </Box>
    );
};

const OnboardingDataSource: FC = () => {
    const guard = useOnboardingPageGuard();

    if (guard.status === 'blocked') {
        return guard.element;
    }

    const canCreateProject = guard.user.ability.can(
        'create',
        subject('Project', {
            organizationUuid: guard.user.organizationUuid,
            type: ProjectType.DEFAULT,
        }),
    );

    if (!canCreateProject) {
        return <Navigate to="/" replace />;
    }

    return <OnboardingDataSourceContent key={guard.user.userUuid} />;
};

export default OnboardingDataSource;
