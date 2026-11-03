import { subject } from '@casl/ability';
import { ProjectType, WarehouseTypes } from '@lightdash/common';
import { Box, Button, Group, Stack, Text, Title } from '@mantine/core';
import { IconTerminal2 } from '@tabler/icons-react';
import { type FC } from 'react';
import {
    Navigate,
    useLocation,
    useParams,
    useSearchParams,
} from 'react-router';
import { DocumentTitle } from '../components/common/DocumentTitle';
import ErrorState from '../components/common/ErrorState';
import MantineIcon from '../components/common/MantineIcon';
import OnboardingLayout from '../components/common/OnboardingLayout';
import { ONBOARDING_DATA_STEPS } from '../components/common/onboardingSteps';
import {
    useOnboardingVariant,
    useStepCopy,
} from '../components/common/onboardingVariant';
import { StepVisual } from '../components/common/OnboardingVisuals';
import { useOnboardingNavigate } from '../components/common/viewTransition';
import { CreateProjectConnection } from '../components/ProjectConnection';
import { ConnectionFormSkeleton } from '../components/ProjectConnection/ConnectionFormSkeleton';
import DbtLogo from '../components/ProjectConnection/ProjectConnectFlow/Assets/dbt.svg';
import {
    DataSourceChooser,
    ShortcutCard,
} from '../components/ProjectConnection/ProjectConnectFlow/DataSourceChooser';
import UnsupportedWarehouse from '../components/ProjectConnection/ProjectConnectFlow/UnsupportedWarehouse';
import {
    getWarehouseIcon,
    getWarehouseLabel,
    OTHER_ROUTE_PARAM,
} from '../components/ProjectConnection/ProjectConnectFlow/utils';
import { ProjectFormProvider } from '../components/ProjectConnection/ProjectFormProvider';
import { MeetAurora } from '../ee/features/agentOnboarding/MeetAurora';
import { useOrganization } from '../hooks/organization/useOrganization';
import { useOnboardingPageGuard } from '../hooks/useOnboardingPageGuard';
import { useProjects } from '../hooks/useProjects';
import { isPlaygroundProvisioningSource } from '../utils/playgroundProject';
import classes from './OnboardingDataSource.module.css';

const isWarehouseType = (value: string): value is WarehouseTypes =>
    Object.values(WarehouseTypes).includes(value as WarehouseTypes);

// Back returns to whichever chooser opened the form, falling back on a fresh tab
const useBackToChooser = () => {
    const onboardingNavigate = useOnboardingNavigate();
    const location = useLocation();
    return () => {
        if (location.key === 'default') {
            onboardingNavigate('/onboarding/data-source');
            return;
        }
        onboardingNavigate(-1);
    };
};

const DataSourcePicker: FC = () => {
    const copy = useStepCopy('warehouse');
    return (
        <Stack gap="lg">
            <Stack gap="xs">
                <Title order={1}>{copy.title}</Title>
                <Text c="dimmed" size="sm">
                    {copy.subtitle}
                </Text>
            </Stack>
            <DataSourceChooser />
        </Stack>
    );
};

const DBT_MODE = 'dbt';
const WAREHOUSE_MODE = 'warehouse';

const DbtQuestion: FC<{ selectedWarehouse: WarehouseTypes }> = ({
    selectedWarehouse,
}) => {
    const onboardingNavigate = useOnboardingNavigate();
    const goBack = useBackToChooser();
    const { search } = useLocation();
    const toMode = (mode: string) =>
        onboardingNavigate(
            `/onboarding/data-source/${selectedWarehouse}/${mode}${search}`,
        );

    return (
        <Stack gap="lg">
            <Group gap="sm" wrap="nowrap">
                <Box className={classes.logo}>
                    {getWarehouseIcon(selectedWarehouse, 'sm')}
                </Box>
                <Stack gap={0}>
                    <Title order={2}>Do you have a dbt project?</Title>
                    <Text c="dimmed" size="sm">
                        We'll use the models and metrics you already have.
                    </Text>
                </Stack>
            </Group>
            <Stack gap="xs">
                <ShortcutCard
                    icon={getWarehouseIcon(selectedWarehouse, 'sm')}
                    title="No, skip"
                    description="Our agent will build your models and metrics for you"
                    onClick={() => toMode(WAREHOUSE_MODE)}
                    primary
                />
                <ShortcutCard
                    icon={<img src={DbtLogo} alt="" width={16} height={16} />}
                    title="Yes, connect it from git"
                    description={`Connect ${getWarehouseLabel(selectedWarehouse)} and your dbt repository`}
                    onClick={() => toMode(DBT_MODE)}
                />
                <ShortcutCard
                    icon={
                        <MantineIcon
                            icon={IconTerminal2}
                            size={16}
                            color="ldGray.7"
                        />
                    }
                    title="Yes, deploy it with the CLI"
                    description="Run lightdash deploy from your dbt project"
                    onClick={() => onboardingNavigate('/onboarding/dbt/cli')}
                />
            </Stack>
            <Group>
                <Button
                    variant="transparent"
                    color="gray"
                    px={0}
                    onClick={goBack}
                >
                    Back
                </Button>
            </Group>
        </Stack>
    );
};

const WarehouseConnect: FC<{
    selectedWarehouse: WarehouseTypes;
    withDbt: boolean;
}> = ({ selectedWarehouse, withDbt }) => {
    const goBack = useBackToChooser();
    const [searchParams] = useSearchParams();
    const then = searchParams.get('then');
    const {
        isInitialLoading: isLoadingOrganization,
        data: organization,
        error: organizationError,
    } = useOrganization();

    const { data: projects, isInitialLoading: isLoadingProjects } =
        useProjects();

    if (isLoadingOrganization || isLoadingProjects) {
        return <ConnectionFormSkeleton />;
    }

    // Sample data is a project too, but connecting a warehouse is still the first real one
    const hasRealProject = (projects ?? []).some(
        ({ type, provisioningSource }) =>
            type === ProjectType.DEFAULT &&
            !isPlaygroundProvisioningSource(provisioningSource),
    );

    if (organizationError || !organization) {
        return <ErrorState error={organizationError?.error} />;
    }

    return (
        <Box className={classes.connectColumn}>
            <Stack gap="lg">
                <Group gap="sm" wrap="nowrap">
                    <Box className={classes.logo}>
                        {getWarehouseIcon(selectedWarehouse, 'sm')}
                    </Box>
                    <Title order={2}>
                        Create a {getWarehouseLabel(selectedWarehouse)}{' '}
                        connection
                    </Title>
                </Group>
                <ProjectFormProvider>
                    <CreateProjectConnection
                        isCreatingFirstProject={!hasRealProject}
                        selectedWarehouse={selectedWarehouse}
                        warehouseOnly={!withDbt}
                        alwaysShowProjectName
                        successRedirect={(projectUuid) =>
                            `/onboarding/tools/${projectUuid}${
                                then
                                    ? `?connect=${encodeURIComponent(then)}`
                                    : ''
                            }`
                        }
                        footerStart={
                            <Button
                                variant="transparent"
                                color="gray"
                                px={0}
                                onClick={goBack}
                            >
                                Back
                            </Button>
                        }
                    />
                </ProjectFormProvider>
            </Stack>
        </Box>
    );
};

const OtherWarehouseConnect: FC = () => {
    const goBack = useBackToChooser();

    return (
        <Box className={classes.connectColumn}>
            <UnsupportedWarehouse onBack={goBack} />
        </Box>
    );
};

const OnboardingDataSourceContent: FC = () => {
    const { warehouse, mode } = useParams<{
        warehouse?: string;
        mode?: string;
    }>();
    const [searchParams] = useSearchParams();
    const [variant] = useOnboardingVariant();

    const selectedWarehouse =
        warehouse && isWarehouseType(warehouse) ? warehouse : undefined;

    if (warehouse && !selectedWarehouse && warehouse !== OTHER_ROUTE_PARAM) {
        return <Navigate to="/onboarding/data-source" replace />;
    }

    if (
        mode &&
        (!selectedWarehouse || (mode !== DBT_MODE && mode !== WAREHOUSE_MODE))
    ) {
        return <Navigate to="/onboarding/data-source" replace />;
    }

    if (!warehouse && variant === 'b' && searchParams.get('intro') !== 'done') {
        return (
            <OnboardingLayout
                screen="meet_aurora"
                journey={{ currentStep: 1, steps: ONBOARDING_DATA_STEPS }}
                aside={<StepVisual step="welcome" />}
            >
                <DocumentTitle title="Meet Aurora" />
                <MeetAurora />
            </OnboardingLayout>
        );
    }

    return (
        <OnboardingLayout
            screen={warehouse ? 'warehouse_form' : 'choose_source'}
            journey={{ currentStep: 1, steps: ONBOARDING_DATA_STEPS }}
            stackDepth={mode ? 2 : warehouse ? 1 : 0}
            aside={<StepVisual step="warehouse" />}
        >
            <DocumentTitle title="Add a data source" />
            {selectedWarehouse && mode ? (
                <WarehouseConnect
                    selectedWarehouse={selectedWarehouse}
                    withDbt={mode === DBT_MODE}
                />
            ) : selectedWarehouse ? (
                <DbtQuestion selectedWarehouse={selectedWarehouse} />
            ) : warehouse === OTHER_ROUTE_PARAM ? (
                <OtherWarehouseConnect />
            ) : (
                <DataSourcePicker />
            )}
        </OnboardingLayout>
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
        return <Navigate to="/no-access" replace />;
    }

    return <OnboardingDataSourceContent key={guard.user.userUuid} />;
};

export default OnboardingDataSource;
