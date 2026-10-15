import { FeatureFlags } from '@lightdash/common';
import { Box, Stack, Text } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router';
import Page from '../../../components/common/Page/Page';
import PageSpinner from '../../../components/PageSpinner';
import { OnboardingTitle } from '../../../components/ProjectConnection/ProjectConnectFlow/common/OnboardingTitle';
import { useProject } from '../../../hooks/useProject';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../../providers/App/useApp';
import { AgentOnboardingLaunchPanel } from './AgentOnboardingLaunchPanel';

const AgentOnboardingStartPage: FC = () => {
    const { t } = useTranslation('agentOnboarding');
    const projectUuid = useProjectUuid();
    const { health } = useApp();
    const { data: project, isInitialLoading: isLoadingProject } =
        useProject(projectUuid);
    const codingAgentOnboardingFlag = useServerFeatureFlag(
        FeatureFlags.CodingAgentOnboarding,
    );

    if (
        codingAgentOnboardingFlag.isInitialLoading ||
        isLoadingProject ||
        health.isInitialLoading
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

    return (
        <Page title={t('pageTitle')} withFixedContent withPaddedContent>
            <Stack w="100%" maw={960} mx="auto" mt="xl">
                <Box>
                    <OnboardingTitle>{t('start.title')}</OnboardingTitle>
                    <Text c="dimmed" mt="xs">
                        {t('start.subtitle')}
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
