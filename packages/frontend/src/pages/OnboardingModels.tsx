import { Box, Button, Stack, Text, Title } from '@mantine/core';
import { useCallback, type FC } from 'react';
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
import { useOnboardingPageGuard } from '../hooks/useOnboardingPageGuard';
import { useProject } from '../hooks/useProject';
import useTracking from '../providers/Tracking/useTracking';
import { EventName } from '../types/Events';
import classes from './OnboardingDataSource.module.css';

const OnboardingModelsContent: FC<{ projectUuid: string }> = ({
    projectUuid,
}) => {
    useTrackOnboardingScreen('dbt_repo');
    const onboardingNavigate = useOnboardingNavigate();
    const { track } = useTracking();
    const { data: project } = useProject(projectUuid);

    const goToTools = useCallback(
        () => onboardingNavigate(`/projects/${projectUuid}/home`),
        [onboardingNavigate, projectUuid],
    );

    if (!project) return <ConnectionFormSkeleton />;

    return (
        <Box className={classes.connectColumn}>
            <Stack gap="lg">
                <Stack gap={4}>
                    <Title order={2}>Connect your repo</Title>
                    <Text c="dimmed" size="sm">
                        Already have models in a repo? Connect it so your team
                        can ask questions with them. You can also do this later
                        in project settings.
                    </Text>
                </Stack>
                <ConnectRepoForm
                    project={project}
                    onConnected={goToTools}
                    footerStart={
                        <Button
                            variant="transparent"
                            color="gray"
                            px={0}
                            onClick={() => {
                                track({
                                    name: EventName.ONBOARDING_STEP_SKIPPED,
                                    properties: { screen: 'dbt_repo' },
                                });
                                goToTools();
                            }}
                        >
                            Skip for now
                        </Button>
                    }
                />
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
            <DocumentTitle title="Connect your repo" />
            <OnboardingModelsContent projectUuid={projectUuid} />
        </OnboardingLayout>
    );
};

export default OnboardingModels;
