import { FeatureFlags, WarehouseTypes } from '@lightdash/common';
import {
    Box,
    Button,
    Group,
    Paper,
    SimpleGrid,
    Stack,
    Text,
    Title,
    Tooltip,
} from '@mantine-8/core';
import {
    IconChevronLeft,
    IconFileCode,
    IconFileSpreadsheet,
    IconPlugConnected,
} from '@tabler/icons-react';
import { type FC } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { DocumentTitle } from '../components/common/DocumentTitle';
import MantineIcon from '../components/common/MantineIcon';
import PageSpinner from '../components/PageSpinner';
import ConnectManuallyStep2 from '../components/ProjectConnection/ProjectConnectFlow/ConnectManually/ConnectManuallyStep2';
import InviteExpertFooter from '../components/ProjectConnection/ProjectConnectFlow/InviteExpertFooter';
import { OtherWarehouse } from '../components/ProjectConnection/ProjectConnectFlow/types';
import {
    getWarehouseIcon,
    WarehouseTypeLabels,
} from '../components/ProjectConnection/ProjectConnectFlow/utils';
import { ProjectFormProvider } from '../components/ProjectConnection/ProjectFormProvider';
import { useOrganization } from '../hooks/organization/useOrganization';
import { useServerFeatureFlag } from '../hooks/useServerOrClientFeatureFlag';
import useApp from '../providers/App/useApp';
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

const BackToChat: FC = () => {
    const navigate = useNavigate();
    return (
        <Box className={classes.topBar}>
            <Button
                variant="subtle"
                size="sm"
                color="blue"
                className={classes.backButton}
                leftSection={<MantineIcon icon={IconChevronLeft} />}
                onClick={() => void navigate('/onboarding/agent')}
            >
                Back to chat
            </Button>
        </Box>
    );
};

const DataSourcePicker: FC = () => {
    const navigate = useNavigate();

    return (
        <Box className={classes.column}>
            <Stack align="center" gap="xs">
                <Title order={1} ta="center" fw={700}>
                    Add a data source
                </Title>
                <Text size="md" c="dimmed" ta="center">
                    Connecting a warehouse is the main event — it's what makes
                    Aurora useful.
                </Text>
            </Stack>

            <Stack gap="md">
                <SectionHeader
                    title="Data warehouses"
                    hint="Pick yours to connect"
                />
                <SimpleGrid cols={{ base: 2, sm: 3, md: 5 }} spacing="md">
                    {orderedWarehouses.map((warehouse) => {
                        const isEnabled =
                            warehouse.key === WarehouseTypes.SNOWFLAKE;

                        const card = (
                            <Paper
                                key={warehouse.key}
                                withBorder
                                radius="md"
                                className={`${classes.warehouseCard} ${
                                    isEnabled
                                        ? classes.warehouseCardEnabled
                                        : classes.warehouseCardDisabled
                                }`}
                                onClick={
                                    isEnabled
                                        ? () =>
                                              void navigate(
                                                  '/onboarding/data-source/snowflake',
                                              )
                                        : undefined
                                }
                            >
                                <Box
                                    className={
                                        isEnabled
                                            ? undefined
                                            : classes.disabledContent
                                    }
                                >
                                    {getWarehouseIcon(warehouse.key, 40)}
                                </Box>
                                <Text
                                    className={`${classes.warehouseLabel} ${
                                        isEnabled ? '' : classes.disabledContent
                                    }`}
                                >
                                    {warehouse.label}
                                </Text>
                            </Paper>
                        );

                        if (isEnabled) {
                            return card;
                        }

                        return (
                            <Tooltip
                                key={warehouse.key}
                                label="Coming soon"
                                position="top"
                            >
                                <Box>{card}</Box>
                            </Tooltip>
                        );
                    })}
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

const SnowflakeConnect: FC = () => {
    const navigate = useNavigate();
    const { isInitialLoading: isLoadingOrganization, data: organization } =
        useOrganization();

    if (isLoadingOrganization || !organization) {
        return <PageSpinner />;
    }

    return (
        <Box className={classes.connectColumn}>
            <ProjectFormProvider>
                <ConnectManuallyStep2
                    isCreatingFirstProject={!!organization.needsProject}
                    selectedWarehouse={WarehouseTypes.SNOWFLAKE}
                    warehouseOnly
                    onBack={() => void navigate('/onboarding/data-source')}
                    successRedirect={() => '/onboarding/agent'}
                />
            </ProjectFormProvider>
        </Box>
    );
};

const OnboardingDataSourceContent: FC = () => {
    const { warehouse } = useParams<{ warehouse?: string }>();

    if (warehouse && warehouse !== 'snowflake') {
        return <Navigate to="/onboarding/data-source" replace />;
    }

    return (
        <Box className={classes.page}>
            <DocumentTitle title="Add a data source" />
            <BackToChat />
            {warehouse === 'snowflake' ? (
                <SnowflakeConnect />
            ) : (
                <DataSourcePicker />
            )}
        </Box>
    );
};

const OnboardingDataSource: FC = () => {
    const { health, user } = useApp();
    const orgSetupPageFlag = useServerFeatureFlag(
        FeatureFlags.OrganizationSetupPage,
    );

    if (health.isInitialLoading || health.error) {
        return <PageSpinner />;
    }

    if (!health.data?.isAuthenticated) {
        return <Navigate to="/login" />;
    }

    if (user.isInitialLoading || orgSetupPageFlag.isLoading) {
        return <PageSpinner />;
    }

    if (!user.data) {
        return <PageSpinner />;
    }

    if (!user.data.organizationUuid) {
        return <Navigate to="/join-organization" />;
    }

    if (!orgSetupPageFlag.data?.enabled) {
        return <Navigate to="/" />;
    }

    return <OnboardingDataSourceContent key={user.data.userUuid} />;
};

export default OnboardingDataSource;
