import { FeatureFlags } from '@lightdash/common';
import { Box, Button, Group, Stack, Title } from '@mantine/core';
import { useCallback, useState, type FC } from 'react';
import { Navigate, useParams } from 'react-router';
import { DocumentTitle } from '../components/common/DocumentTitle';
import OnboardingLayout from '../components/common/OnboardingLayout';
import { ONBOARDING_DATA_STEPS } from '../components/common/onboardingSteps';
import { WarehouseVisual } from '../components/common/OnboardingVisuals';
import { useTrackOnboardingScreen } from '../components/common/useTrackOnboardingScreen';
import { useOnboardingNavigate } from '../components/common/viewTransition';
import { ConnectionFormSkeleton } from '../components/ProjectConnection/ConnectionFormSkeleton';
import { ConnectRepoForm } from '../components/ProjectConnection/ProjectConnectFlow/ConnectRepoForm';
import { LiveSourcesNextUp } from '../components/ProjectConnection/ProjectConnectFlow/LiveSourcesTeaser';
import {
    RepoQuestion,
    type ModelSource,
} from '../components/ProjectConnection/ProjectConnectFlow/RepoQuestion';
import { useStartAgentOnboardingRun } from '../ee/features/agentOnboarding/hooks/useAgentOnboarding';
import { useOnboardingPageGuard } from '../hooks/useOnboardingPageGuard';
import { useProject } from '../hooks/useProject';
import { useServerFeatureFlag } from '../hooks/useServerOrClientFeatureFlag';
import classes from './OnboardingDataSource.module.css';

const OnboardingModelsContent: FC<{ projectUuid: string }> = ({
    projectUuid,
}) => {
    const onboardingNavigate = useOnboardingNavigate();
    const [source, setSource] = useState<ModelSource>('build');
    useTrackOnboardingScreen(source === 'repo' ? 'dbt_repo' : 'model_source');
    const canBuildModels =
        useServerFeatureFlag(FeatureFlags.CodingAgentOnboarding).data
            ?.enabled === true;
    const { data: project } = useProject(projectUuid);
    const startRun = useStartAgentOnboardingRun();

    const goToTools = useCallback(
        () => onboardingNavigate(`/projects/${projectUuid}/home`),
        [onboardingNavigate, projectUuid],
    );

    const handleContinue = () => {
        if (!canBuildModels) {
            goToTools();
            return;
        }
        startRun.mutate(projectUuid, { onSuccess: goToTools });
    };

    if (!project) return <ConnectionFormSkeleton />;

    return (
        <Box className={classes.connectColumn}>
            <Stack gap="lg">
                <Title order={2}>Set up your models</Title>
                <RepoQuestion
                    value={source}
                    onChange={setSource}
                    canBuildModels={canBuildModels}
                />
                {source === 'repo' ? (
                    <ConnectRepoForm
                        project={project}
                        onConnected={goToTools}
                    />
                ) : (
                    <Group justify="flex-end" data-form-footer>
                        <Button
                            loading={startRun.isLoading}
                            onClick={handleContinue}
                        >
                            {canBuildModels ? 'Build my models' : 'Continue'}
                        </Button>
                    </Group>
                )}
            </Stack>
        </Box>
    );
};

const OnboardingModels: FC = () => {
    const guard = useOnboardingPageGuard();
    const { projectUuid } = useParams<{ projectUuid: string }>();

    if (guard.status === 'blocked') return guard.element;
    if (!projectUuid) return <Navigate to="/" replace />;

    return (
        <OnboardingLayout
            journey={{ currentStep: 2, steps: ONBOARDING_DATA_STEPS }}
            stackDepth={2}
            aside={<WarehouseVisual nextUp={<LiveSourcesNextUp />} />}
        >
            <DocumentTitle title="Set up your models" />
            <OnboardingModelsContent projectUuid={projectUuid} />
        </OnboardingLayout>
    );
};

export default OnboardingModels;
