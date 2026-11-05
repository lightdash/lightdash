import { FeatureFlags, isAgentOnboardingRunTerminal } from '@lightdash/common';
import { Box, Stack, Text } from '@mantine/core';
import { type FC } from 'react';
import { Navigate } from 'react-router';
import Page from '../../../components/common/Page/Page';
import PageSpinner from '../../../components/PageSpinner';
import { OnboardingTitle } from '../../../components/ProjectConnection/ProjectConnectFlow/common/OnboardingTitle';
import { useProject } from '../../../hooks/useProject';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../../providers/App/useApp';
import { AgentOnboardingLaunchPanel } from './AgentOnboardingLaunchPanel';
import { useActiveAgentOnboardingRun } from './hooks/useAgentOnboarding';
import { getAgentOnboardingRunUrl } from './utils';

const AgentOnboardingStartPage: FC = () => {
    const projectUuid = useProjectUuid();
    const { health } = useApp();
    const { data: project, isInitialLoading: isLoadingProject } =
        useProject(projectUuid);
    const codingAgentOnboardingFlag = useServerFeatureFlag(
        FeatureFlags.CodingAgentOnboarding,
    );
    const newOnboardingFlag = useServerFeatureFlag(FeatureFlags.NewOnboarding);
    const activeRun = useActiveAgentOnboardingRun(projectUuid, {
        enabled: newOnboardingFlag.data?.enabled === true,
    });

    if (
        codingAgentOnboardingFlag.isInitialLoading ||
        newOnboardingFlag.isInitialLoading ||
        isLoadingProject ||
        health.isInitialLoading ||
        activeRun.isInitialLoading
    ) {
        return <PageSpinner />;
    }

    if (
        codingAgentOnboardingFlag.data?.enabled !== true ||
        !project ||
        !project.warehouseConnection ||
        !health.data
    ) {
        return (
            <Navigate
                to={`/generalSettings/projectManagement/${projectUuid}/settings`}
                replace
            />
        );
    }

    if (
        activeRun.data &&
        !isAgentOnboardingRunTerminal(activeRun.data.status)
    ) {
        return (
            <Navigate
                to={getAgentOnboardingRunUrl(
                    activeRun.data.agentOnboardingRunUuid,
                    activeRun.data.projectUuid,
                )}
                replace
            />
        );
    }

    return (
        <Page title="Project setup" withFixedContent withPaddedContent>
            <Stack w="100%" maw={960} mx="auto" mt="xl">
                <Box>
                    <OnboardingTitle>
                        Set up your semantic layer
                    </OnboardingTitle>
                    <Text c="dimmed" mt="xs">
                        Turn your warehouse tables into metrics and dimensions
                        your team can explore.
                    </Text>
                </Box>
            </Stack>
            <AgentOnboardingLaunchPanel
                project={project}
                warehouseType={project.warehouseConnection.type}
                siteUrl={health.data.siteUrl}
            />
        </Page>
    );
};

export default AgentOnboardingStartPage;
