import { subject } from '@casl/ability';
import { FeatureFlags, WarehouseTypes } from '@lightdash/common';
import { Select, Stack } from '@mantine/core';
import { useState, type ReactNode } from 'react';
import { Navigate, useParams } from 'react-router';
import EmptyStateLoader from '../../components/common/EmptyStateLoader';
import InlineErrorState from '../../components/common/InlineErrorState';
import {
    SettingsPage,
    SettingsPageContainer,
} from '../../components/common/Settings/SettingsPage';
import SuboptimalState from '../../components/common/SuboptimalState/SuboptimalState';
import { useProject } from '../../hooks/useProject';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import { useWarehouseConnections } from '../../hooks/useWarehouseConnections';
import useApp from '../../providers/App/useApp';
import { AiIdentitySettings } from './AiIdentitySettings';
import { useAiAccessCapabilities, useAiAccessPolicy } from './api';
const ConnectionAccess = ({
    projectUuid,
    connection,
    connectionSelector,
}: {
    projectUuid: string;
    connection: string | null;
    connectionSelector: ReactNode;
}) => {
    const policy = useAiAccessPolicy(projectUuid, connection);
    const capabilities = useAiAccessCapabilities(projectUuid, connection);
    if (policy.isLoading || capabilities.isLoading) return <EmptyStateLoader />;
    if (policy.isError || capabilities.isError)
        return (
            <InlineErrorState
                message="Could not load agent identity settings."
                onRetry={() => {
                    void policy.refetch();
                    void capabilities.refetch();
                }}
            />
        );
    return (
        <AiIdentitySettings
            connectionSelector={connectionSelector}
            key={policy.data?.updatedAt.toString() ?? 'new'}
            projectUuid={projectUuid}
            connection={connection}
            policy={policy.data}
            capabilities={capabilities.data}
        />
    );
};
const ProjectAccess = ({ projectUuid }: { projectUuid: string }) => {
    const connections = useWarehouseConnections(projectUuid);
    const [connection, setConnection] = useState<string | null>(null);
    const snowflakeConnections =
        connections.data?.connections.filter(
            (item) => item.warehouseType === WarehouseTypes.SNOWFLAKE,
        ) ?? [];
    const selectedConnection = snowflakeConnections.some(
        (item) => item.warehouseConnectionUuid === connection,
    )
        ? connection
        : null;
    return (
        <SettingsPage
            title="Agent identity"
            description="Every query an agent runs is marked, so your warehouse can treat it differently."
        >
            <SettingsPageContainer>
                <Stack gap="xl">
                    <ConnectionAccess
                        connectionSelector={
                            snowflakeConnections.length > 1 && (
                                <Select
                                    label="Warehouse connection"
                                    value={selectedConnection ?? 'original'}
                                    data={snowflakeConnections.map((item) => ({
                                        value: item.isOriginal
                                            ? 'original'
                                            : item.warehouseConnectionUuid,
                                        label: item.name,
                                    }))}
                                    onChange={(value) =>
                                        setConnection(
                                            value === 'original' ? null : value,
                                        )
                                    }
                                />
                            )
                        }
                        key={selectedConnection ?? 'original'}
                        projectUuid={projectUuid}
                        connection={selectedConnection}
                    />
                </Stack>
            </SettingsPageContainer>
        </SettingsPage>
    );
};
export const AiAccessPage = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { user } = useApp();
    const project = useProject(projectUuid);
    const { data: flag, isLoading } = useServerFeatureFlag(
        FeatureFlags.AiPrincipals,
    );
    if (isLoading || project.isLoading) return <EmptyStateLoader />;
    if (!project.data || !flag?.enabled)
        return (
            <SuboptimalState title="Agent identity settings are not available." />
        );
    if (
        !user.data?.ability.can('manage', subject('Project', project.data)) ||
        project.data.warehouseConnection?.type !== WarehouseTypes.SNOWFLAKE
    )
        return (
            <Navigate
                to={`/generalSettings/projectManagement/${project.data.projectUuid}`}
                replace
            />
        );
    return (
        <ProjectAccess
            key={project.data.projectUuid}
            projectUuid={project.data.projectUuid}
        />
    );
};
