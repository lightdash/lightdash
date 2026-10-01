import {
    FeatureFlags,
    ProjectSetupFinish,
    ProjectSetupStepStatus,
    type GitHost,
    type Project,
} from '@lightdash/common';
import { Box, Divider, Group, Stack, Text, Title } from '@mantine/core';
import { useState, type FC } from 'react';
import { Navigate, useNavigate } from 'react-router';
import Callout from '../components/common/Callout';
import { DocumentTitle } from '../components/common/DocumentTitle';
import PageSpinner from '../components/PageSpinner';
import { GitHostConnectForm } from '../components/ProjectConnection/SemanticLayerStep/GitHostConnectForm';
import {
    CliDeployOption,
    GitHostTiles,
    MoreOptions,
    SectionHeader,
    SkipOption,
} from '../components/ProjectConnection/SemanticLayerStep/SemanticLayerOptions';
import { AgentOnboardingLaunchPanel } from '../ee/features/agentOnboarding/AgentOnboardingLaunchPanel';
import { useIsCopilotEnabled } from '../ee/features/aiCopilot/hooks/useIsCopilotEnabled';
import { useProject } from '../hooks/useProject';
import {
    getSemanticLayerStatus,
    useProjectSetup,
    useSkipSemanticLayer,
} from '../hooks/useProjectSetup';
import { useProjectUuid } from '../hooks/useProjectUuid';
import { useServerFeatureFlag } from '../hooks/useServerOrClientFeatureFlag';
import useApp from '../providers/App/useApp';
import classes from './SemanticLayerStep.module.css';

const STATUS_CALLOUTS: Partial<
    Record<
        ProjectSetupStepStatus,
        { variant: 'info' | 'danger' | 'warning'; title: string; body: string }
    >
> = {
    [ProjectSetupStepStatus.RUNNING]: {
        variant: 'info',
        title: 'Deploying your semantic layer',
        body: 'Lightdash is cloning and compiling your project. This page moves on when it finishes.',
    },
    [ProjectSetupStepStatus.FAILED]: {
        variant: 'danger',
        title: 'The last deploy failed',
        body: 'Check the repository, branch and project path, then connect again.',
    },
    [ProjectSetupStepStatus.PARTIAL]: {
        variant: 'warning',
        title: 'The last deploy was partial',
        body: 'Some connections failed to compile and kept their previous explores. Fix them in project settings, or skip for now.',
    },
};

const StepHeader: FC<{ project: Project }> = ({ project }) => {
    const navigate = useNavigate();
    const skip = useSkipSemanticLayer(project.projectUuid);
    return (
        <Group justify="space-between" align="flex-start" wrap="nowrap">
            <Stack gap="xs">
                <Title order={1}>Add your semantic layer</Title>
                <Text c="dimmed">
                    {project.name} is connected. Add the models that define your
                    metrics, or skip and explore your tables first.
                </Text>
            </Stack>
            <SkipOption
                isSkipping={skip.isLoading}
                onSkip={() =>
                    void skip
                        .mutateAsync()
                        .then(() =>
                            navigate(`/projects/${project.projectUuid}/home`),
                        )
                        .catch(() => undefined)
                }
            />
        </Group>
    );
};

const StepOptions: FC<{ project: Project; isWaiting: boolean }> = ({
    project,
    isWaiting,
}) => {
    const { health } = useApp();
    const isCopilotEnabled = useIsCopilotEnabled();
    const [host, setHost] = useState<GitHost | null>(null);

    if (host) {
        return (
            <GitHostConnectForm
                host={host}
                project={project}
                onBack={() => setHost(null)}
                onSaved={() => setHost(null)}
            />
        );
    }

    return (
        <Stack gap="xl">
            <GitHostTiles onPick={setHost} />
            <Divider />
            <CliDeployOption
                projectUuid={project.projectUuid}
                isWaiting={isWaiting}
            />
            {isCopilotEnabled && project.warehouseConnection && (
                <>
                    <Divider />
                    <SectionHeader
                        title="Let an agent build it"
                        description="An agent reads your warehouse and writes the models for you."
                    />
                    <AgentOnboardingLaunchPanel
                        project={project}
                        warehouseType={project.warehouseConnection.type}
                        siteUrl={health.data?.siteUrl ?? ''}
                    />
                </>
            )}
            <MoreOptions projectUuid={project.projectUuid} />
        </Stack>
    );
};

const SemanticLayerStep: FC = () => {
    const projectUuid = useProjectUuid();
    const connectJourneyFlag = useServerFeatureFlag(
        FeatureFlags.ConnectJourney,
    );
    const isEnabled = connectJourneyFlag.data?.enabled === true;
    const project = useProject(projectUuid);
    const setup = useProjectSetup(projectUuid, {
        enabled: isEnabled,
        poll: true,
    });

    if (connectJourneyFlag.isLoading || project.isInitialLoading) {
        return <PageSpinner />;
    }
    if (!isEnabled || !project.data) {
        return <Navigate to={`/projects/${projectUuid}/home`} replace />;
    }
    if (setup.data?.finish === ProjectSetupFinish.DEPLOYED) {
        return <Navigate to={`/projects/${projectUuid}/home`} replace />;
    }

    const status = getSemanticLayerStatus(setup.data);
    const callout = status ? STATUS_CALLOUTS[status] : undefined;

    return (
        <Box className={classes.page}>
            <DocumentTitle title="Add your semantic layer" />
            <Box className={classes.column}>
                <StepHeader project={project.data} />
                {callout && (
                    <Callout variant={callout.variant} title={callout.title}>
                        {callout.body}
                    </Callout>
                )}
                <StepOptions
                    project={project.data}
                    isWaiting={status !== ProjectSetupStepStatus.SUCCEEDED}
                />
            </Box>
        </Box>
    );
};

export default SemanticLayerStep;
