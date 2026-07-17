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
    Tooltip,
} from '@mantine-8/core';
import {
    IconFileCode,
    IconFileSpreadsheet,
    IconPlugConnected,
} from '@tabler/icons-react';
import { type FC } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import AboutFooter from '../components/AboutFooter';
import { DocumentTitle } from '../components/common/DocumentTitle';
import ErrorState from '../components/common/ErrorState';
import MantineIcon from '../components/common/MantineIcon';
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

const OTHER_ROUTE_PARAM = 'other';

const isWarehouseType = (value: string): value is WarehouseTypes =>
    Object.values(WarehouseTypes).includes(value as WarehouseTypes);

const getWarehouseRoute = (key: SelectedWarehouse) =>
    `/onboarding/data-source/${
        key === OtherWarehouse.Other ? OTHER_ROUTE_PARAM : key
    }`;

const OTHER_SOURCES = [
    {
        icon: IconPlugConnected,
        tileClass: classes.iconTileViolet,
        iconColor: 'violet',
        title: 'MCP server',
        subtitle: 'Connect a tool via MCP',
    },
    {
        icon: IconFileCode,
        tileClass: classes.iconTileTeal,
        iconColor: 'teal',
        title: 'dbt project',
        subtitle: 'Import models & metrics',
    },
    {
        icon: IconFileSpreadsheet,
        tileClass: classes.iconTileBlue,
        iconColor: 'blue',
        title: 'CSV / Sheet',
        subtitle: 'Upload a flat file',
    },
];

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
                <SectionHeader
                    title="Data warehouses"
                    hint="Pick yours to connect"
                />
                <SimpleGrid cols={{ base: 2, sm: 3, md: 5 }} spacing="md">
                    {orderedWarehouses.map((warehouse) => (
                        <Paper
                            key={warehouse.key}
                            withBorder
                            radius="md"
                            className={`${classes.warehouseCard} ${classes.warehouseCardEnabled}`}
                            onClick={() =>
                                void navigate(getWarehouseRoute(warehouse.key))
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

            <Stack gap="md">
                <SectionHeader title="Other sources" />
                <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
                    {OTHER_SOURCES.map((source) => (
                        <Tooltip
                            key={source.title}
                            label="Coming soon"
                            position="top"
                        >
                            <Paper
                                withBorder
                                radius="md"
                                p="md"
                                className={`${classes.otherCard} ${classes.disabledContent}`}
                            >
                                <Box
                                    className={`${classes.iconTile} ${source.tileClass}`}
                                >
                                    <MantineIcon
                                        icon={source.icon}
                                        color={source.iconColor}
                                        size={24}
                                    />
                                </Box>
                                <Stack gap={2}>
                                    <Text fw={600}>{source.title}</Text>
                                    <Text size="sm" c="dimmed">
                                        {source.subtitle}
                                    </Text>
                                </Stack>
                            </Paper>
                        </Tooltip>
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
