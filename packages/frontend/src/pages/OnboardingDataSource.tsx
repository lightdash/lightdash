import { subject } from '@casl/ability';
import { ProjectType, WarehouseTypes } from '@lightdash/common';
import { Anchor, Box, Button, Group, Stack, Text, Title } from '@mantine/core';
import { useState, type FC } from 'react';
import {
    Navigate,
    useLocation,
    useParams,
    useSearchParams,
} from 'react-router';
import { DocumentTitle } from '../components/common/DocumentTitle';
import ErrorState from '../components/common/ErrorState';
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
import { type ConnectionFormStep } from '../components/ProjectConnection/CreateProjectconnection';
import { DataSourceChooser } from '../components/ProjectConnection/ProjectConnectFlow/DataSourceChooser';
import { LiveSourcesNote } from '../components/ProjectConnection/ProjectConnectFlow/LiveSourcesTeaser';
import {
    getWarehouseIcon,
    getWarehouseLabel,
    OTHER_ROUTE_PARAM,
} from '../components/ProjectConnection/ProjectConnectFlow/utils';
import { ProjectFormProvider } from '../components/ProjectConnection/ProjectFormProvider';
import { MeetAurora } from '../ee/features/agentOnboarding/MeetAurora';
import { withViewTransition } from '../features/apps/utils/viewTransition';
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
                {copy.subtitle && (
                    <Text c="dimmed" size="sm">
                        {copy.subtitle}
                    </Text>
                )}
            </Stack>
            <DataSourceChooser />
        </Stack>
    );
};

const REPO_MODE = 'repo';

const WarehouseConnect: FC<{
    selectedWarehouse: WarehouseTypes;
    withDbt: boolean;
}> = ({ selectedWarehouse, withDbt }) => {
    const goBack = useBackToChooser();
    const onboardingNavigate = useOnboardingNavigate();
    const [step, setStep] = useState<ConnectionFormStep>('warehouse');
    const isDbtStep = withDbt && step === 'dbt';
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
                    {!isDbtStep && (
                        <Box className={classes.logo}>
                            {getWarehouseIcon(selectedWarehouse, 'sm')}
                        </Box>
                    )}
                    <Stack gap={4}>
                        <Title order={2}>
                            {isDbtStep
                                ? 'Connect your repo'
                                : `Create a ${getWarehouseLabel(selectedWarehouse)} connection`}
                        </Title>
                        {!isDbtStep && <LiveSourcesNote />}
                        {isDbtStep && (
                            <Text c="dimmed" size="sm">
                                Deploying from your machine?{' '}
                                <Anchor
                                    component="button"
                                    type="button"
                                    inherit
                                    onClick={() =>
                                        onboardingNavigate(
                                            '/onboarding/dbt/cli',
                                        )
                                    }
                                >
                                    Use the CLI
                                </Anchor>
                            </Text>
                        )}
                    </Stack>
                </Group>
                <ProjectFormProvider key={withDbt ? REPO_MODE : 'fresh'}>
                    <CreateProjectConnection
                        isCreatingFirstProject={!hasRealProject}
                        selectedWarehouse={selectedWarehouse}
                        warehouseOnly={!withDbt}
                        steps={
                            withDbt
                                ? {
                                      current: step,
                                      onChange: (next) =>
                                          withViewTransition(() =>
                                              setStep(next),
                                          ),
                                  }
                                : null
                        }
                        alwaysShowProjectName
                        successRedirect={(projectUuid) =>
                            `/onboarding/tools/${projectUuid}`
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

const SUPPORTED_WAREHOUSES = Object.values(WarehouseTypes)
    .map((type) => getWarehouseLabel(type))
    .filter((label): label is string => !!label)
    .join(', ');

const OtherWarehouseConnect: FC = () => {
    const goBack = useBackToChooser();

    return (
        <Box className={classes.connectColumn}>
            <Stack gap="lg">
                <Stack gap="xs">
                    <Title order={2}>We don't connect to that one yet</Title>
                    <Text c="dimmed" size="sm">
                        Today we support {SUPPORTED_WAREHOUSES}.
                    </Text>
                    <Text c="dimmed" size="sm">
                        Tell us which warehouse you use on{' '}
                        <Anchor
                            href="https://github.com/lightdash/lightdash/issues"
                            target="_blank"
                            rel="noreferrer noopener"
                            inherit
                        >
                            GitHub
                        </Anchor>{' '}
                        so we can prioritize it. Meanwhile, the demo project on
                        the previous screen shows what you'd get.
                    </Text>
                </Stack>
                <Group>
                    <Button variant="default" onClick={goBack}>
                        Back
                    </Button>
                </Group>
            </Stack>
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

    if (mode && (!selectedWarehouse || mode !== REPO_MODE)) {
        return <Navigate to="/onboarding/data-source" replace />;
    }

    if (!warehouse && variant === 'b' && searchParams.get('intro') !== 'done') {
        return (
            <OnboardingLayout
                screen="meet_aurora"
                journey={{ currentStep: 1, steps: ONBOARDING_DATA_STEPS }}
                aside={<StepVisual step="welcome" />}
            >
                <DocumentTitle title="Your AI analyst" />
                <MeetAurora />
            </OnboardingLayout>
        );
    }

    return (
        <OnboardingLayout
            screen={warehouse ? 'warehouse_form' : 'choose_source'}
            journey={{ currentStep: 1, steps: ONBOARDING_DATA_STEPS }}
            stackDepth={warehouse ? 1 : 0}
            aside={<StepVisual step="warehouse" />}
        >
            <DocumentTitle title="Add a data source" />
            {selectedWarehouse ? (
                <WarehouseConnect
                    selectedWarehouse={selectedWarehouse}
                    withDbt={mode === REPO_MODE}
                />
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
