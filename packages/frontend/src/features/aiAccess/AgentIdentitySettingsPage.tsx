import { Stack } from '@mantine/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import EmptyStateLoader from '../../components/common/EmptyStateLoader';
import InlineErrorState from '../../components/common/InlineErrorState';
import PageBreadcrumbs from '../../components/common/PageBreadcrumbs';
import {
    SettingsPage,
    SettingsPageContainer,
} from '../../components/common/Settings/SettingsPage';
import { useAiOrganizationAdminSettings } from '../../ee/features/aiCopilot/hooks/useAiOrganizationSettings';
import { useOrganizationGroups } from '../../hooks/useOrganizationGroups';
import { useProjects } from '../../hooks/useProjects';
import useApp from '../../providers/App/useApp';
import { AgentPermissionsSection } from './AgentPermissionsSection';
import { type AgentSettingsAccess } from './agentSettingsAccess';
import {
    useAgentCapabilityPolicy,
    useOrganizationAgentIdentitySettings,
} from './api';
import { OrganizationAgentIdentityCard } from './OrganizationAgentIdentitySection';

const useInitialLoadComplete = (waiting: boolean) => {
    const [ready, setReady] = useState(false);
    if (!ready && !waiting) setReady(true);
    return ready;
};

const useAgentSettingsData = (access: AgentSettingsAccess) => {
    const identity = useOrganizationAgentIdentitySettings();
    const projects = useProjects();
    const policy = useAgentCapabilityPolicy();
    const settings = useAiOrganizationAdminSettings({
        enabled: access.agentsMcp,
    });
    const groups = useOrganizationGroups(
        { includeMembers: 1 },
        { enabled: policy.data?.groupsAvailable === true },
    );
    const requiredQueries = [
        identity,
        policy,
        ...(access.agentsMcp ? [settings] : []),
        ...(policy.data?.groupsAvailable ? [groups] : []),
    ];
    const initialQueries = [...requiredQueries, projects];
    const waiting = initialQueries.some((query) => !query.data);
    const ready = useInitialLoadComplete(waiting);
    const failed = (
        ready || projects.data ? requiredQueries : initialQueries
    ).filter((query) => query.isError);
    return {
        identity,
        projects,
        policy,
        settings,
        groups,
        ready,
        waiting,
        failed,
    };
};

const AgentSettingsContent = ({ access }: { access: AgentSettingsAccess }) => {
    const { t } = useTranslation('aiAccess');
    const { user } = useApp();
    const {
        identity,
        projects,
        policy,
        settings,
        groups,
        ready,
        waiting,
        failed,
    } = useAgentSettingsData(access);
    const hasError = failed.length > 0;
    const error = hasError ? (
        <InlineErrorState
            message={t('settingsPage.loadError')}
            onRetry={() => {
                failed.forEach((query) => void query.refetch());
            }}
        />
    ) : null;
    if (!ready && waiting) return error ?? <EmptyStateLoader />;
    if (!identity.data || !policy.data || !projects.data) return error;
    return (
        <Stack gap="lg">
            {error}
            <OrganizationAgentIdentityCard
                overview={identity.data}
                projects={projects.data}
                canEdit
            />
            <AgentPermissionsSection
                key={user.data?.organizationUuid}
                policy={{
                    ...policy.data,
                    groupsAvailable:
                        policy.data.groupsAvailable &&
                        groups.data !== undefined,
                }}
                groups={groups.data ?? []}
                refetchPolicy={policy.refetch}
                loadError={hasError}
                mcpSettings={access.agentsMcp ? (settings.data ?? null) : null}
            />
        </Stack>
    );
};
export const AgentIdentitySettingsPage = ({
    access,
}: {
    access: AgentSettingsAccess;
}) => {
    const { t } = useTranslation('aiAccess');
    if (!access.agentsPage) return null;
    return (
        <Stack gap="sm">
            <SettingsPageContainer>
                <PageBreadcrumbs
                    size="sm"
                    items={[
                        { title: t('settingsPage.organizationSettings') },
                        { title: t('settingsPage.title'), active: true },
                    ]}
                />
            </SettingsPageContainer>
            <SettingsPage
                title={t('settingsPage.title')}
                description={t('settingsPage.description')}
            >
                <AgentSettingsContent access={access} />
            </SettingsPage>
        </Stack>
    );
};
