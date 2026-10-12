import { Stack } from '@mantine/core';
import { useState } from 'react';
import EmptyStateLoader from '../../components/common/EmptyStateLoader';
import InlineErrorState from '../../components/common/InlineErrorState';
import PageBreadcrumbs from '../../components/common/PageBreadcrumbs';
import {
    SettingsPage,
    SettingsPageContainer,
} from '../../components/common/Settings/SettingsPage';
import { useAiOrganizationAdminSettings } from '../../ee/features/aiCopilot/hooks/useAiOrganizationSettings';
import { useOrganizationGroups } from '../../hooks/useOrganizationGroups';
import useApp from '../../providers/App/useApp';
import { AgentPermissionsSection } from './AgentPermissionsSection';
import { type AgentSettingsAccess } from './agentSettingsAccess';
import {
    useAgentCapabilityPolicy,
    useOrganizationAgentIdentitySettings,
} from './api';
import OrganizationAgentIdentitySection from './OrganizationAgentIdentitySection';

const useInitialLoadComplete = (waiting: boolean) => {
    const [ready, setReady] = useState(false);
    if (!ready && !waiting) setReady(true);
    return ready;
};

const AgentSettingsContent = ({ access }: { access: AgentSettingsAccess }) => {
    const { user } = useApp();
    const identity = useOrganizationAgentIdentitySettings();
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
    const waiting = requiredQueries.some((query) => !query.data);
    const ready = useInitialLoadComplete(waiting);
    const failed = requiredQueries.filter((query) => query.isError);
    const hasError = failed.length > 0;
    const error = hasError ? (
        <InlineErrorState
            message="Could not load agent settings."
            onRetry={() => {
                failed.forEach((query) => void query.refetch());
            }}
        />
    ) : null;
    if (!ready && waiting) return error ?? <EmptyStateLoader />;
    if (!identity.data || !policy.data) return error;
    return (
        <Stack gap="lg">
            {error}
            <OrganizationAgentIdentitySection settings={identity.data} />
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
    if (!access.agentsPage) return null;
    return (
        <Stack gap="sm">
            <SettingsPageContainer>
                <PageBreadcrumbs
                    size="sm"
                    items={[
                        { title: 'Organization settings' },
                        { title: 'Agents', active: true },
                    ]}
                />
            </SettingsPageContainer>
            <SettingsPage
                title="Agents"
                description="Who agents run as, and what they may do. Agents are Ask AI, the Slack agent, MCP clients and the CLI."
            >
                <AgentSettingsContent access={access} />
            </SettingsPage>
        </Stack>
    );
};
