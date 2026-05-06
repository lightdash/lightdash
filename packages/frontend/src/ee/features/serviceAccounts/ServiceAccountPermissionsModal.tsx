import { type ServiceAccount } from '@lightdash/common';
import { Code, Stack, Table, Text } from '@mantine-8/core';
import { type FC } from 'react';
import MantineModal from '../../../components/common/MantineModal';

type Props = {
    isOpen: boolean;
    onClose: () => void;
    serviceAccount: ServiceAccount | undefined;
};

type Permission = { action: string; subject: string; description: string };

const getPermissionKey = (permission: Permission): string =>
    `${permission.action}:${permission.subject}`;

const PERMISSIONS_BY_SCOPE: Record<string, Permission[]> = {
    'org:read': [
        {
            action: 'view',
            subject: 'AiAgent',
            description: 'View AI agents available in the organization',
        },
        {
            action: 'view',
            subject: 'AiAgentThread',
            description: 'View AI agent conversation threads',
        },
        {
            action: 'create',
            subject: 'AiAgentThread',
            description: 'Start new AI agent conversation threads',
        },
        {
            action: 'manage',
            subject: 'ChangeCsvResults',
            description: 'Track and manage changes in CSV results',
        },
        {
            action: 'view',
            subject: 'Dashboard',
            description: 'View dashboards in this project',
        },
        {
            action: 'manage',
            subject: 'Dashboard',
            description: 'Create, edit, and delete dashboards',
        },
        {
            action: 'view',
            subject: 'DashboardComments',
            description: 'Read comments on dashboards',
        },
        {
            action: 'create',
            subject: 'DashboardComments',
            description: 'Add new comments to dashboards',
        },
        {
            action: 'manage',
            subject: 'Explore',
            description: 'Run queries against tables and explores',
        },
        {
            action: 'manage',
            subject: 'ExportCsv',
            description: 'Export query results to CSV files',
        },
        {
            action: 'view',
            subject: 'Job',
            description: 'View background job history',
        },
        {
            action: 'create',
            subject: 'Job',
            description: 'Trigger background jobs',
        },
        {
            action: 'view',
            subject: 'JobStatus',
            description: 'View live status of running jobs',
        },
        {
            action: 'view',
            subject: 'MetricsTree',
            description: 'View relationships between metrics',
        },
        {
            action: 'view',
            subject: 'Organization',
            description: 'View organization details',
        },
        {
            action: 'view',
            subject: 'OrganizationMemberProfile',
            description: 'View profiles of other organization members',
        },
        {
            action: 'view',
            subject: 'PinnedItems',
            description: 'See charts and dashboards pinned in spaces',
        },
        {
            action: 'view',
            subject: 'Project',
            description: 'View project metadata',
        },
        {
            action: 'view',
            subject: 'SavedChart',
            description: 'View saved charts in this project',
        },
        {
            action: 'manage',
            subject: 'SavedChart',
            description: 'Create, edit, and delete saved charts',
        },
        {
            action: 'create',
            subject: 'ScheduledDeliveries',
            description: 'Create scheduled deliveries of charts and dashboards',
        },
        {
            action: 'view',
            subject: 'SemanticViewer',
            description: 'Open and explore the semantic viewer',
        },
        {
            action: 'manage',
            subject: 'SemanticViewer',
            description: 'Build and save semantic viewer queries',
        },
        {
            action: 'view',
            subject: 'Space',
            description: 'View spaces and their contents',
        },
        {
            action: 'manage',
            subject: 'Space',
            description: 'Edit space settings, sharing, and contents',
        },
        {
            action: 'view',
            subject: 'SpotlightTableConfig',
            description: 'View configuration of the Spotlight metric catalog',
        },
        {
            action: 'view',
            subject: 'Tags',
            description: 'View tags applied to content',
        },
        {
            action: 'view',
            subject: 'UnderlyingData',
            description: 'View the underlying rows behind a chart',
        },
    ],
    'org:edit': [
        {
            action: 'view',
            subject: 'AiAgent',
            description: 'View AI agents available in the organization',
        },
        {
            action: 'view',
            subject: 'AiAgentThread',
            description: 'View AI agent conversation threads',
        },
        {
            action: 'create',
            subject: 'AiAgentThread',
            description: 'Start new AI agent conversation threads',
        },
        {
            action: 'manage',
            subject: 'ChangeCsvResults',
            description: 'Track and manage changes in CSV results',
        },
        {
            action: 'view',
            subject: 'Dashboard',
            description: 'View dashboards in this project',
        },
        {
            action: 'manage',
            subject: 'Dashboard',
            description: 'Create, edit, and delete dashboards',
        },
        {
            action: 'view',
            subject: 'DashboardComments',
            description: 'Read comments on dashboards',
        },
        {
            action: 'create',
            subject: 'DashboardComments',
            description: 'Add new comments to dashboards',
        },
        {
            action: 'manage',
            subject: 'DashboardComments',
            description: 'Edit and delete dashboard comments from any user',
        },
        {
            action: 'manage',
            subject: 'Explore',
            description: 'Run queries against tables and explores',
        },
        {
            action: 'manage',
            subject: 'ExportCsv',
            description: 'Export query results to CSV files',
        },
        {
            action: 'view',
            subject: 'Job',
            description: 'View background job history',
        },
        {
            action: 'create',
            subject: 'Job',
            description: 'Trigger background jobs',
        },
        {
            action: 'manage',
            subject: 'Job',
            description: 'Manage all background jobs across users',
        },
        {
            action: 'view',
            subject: 'JobStatus',
            description: 'View live status of running jobs',
        },
        {
            action: 'view',
            subject: 'MetricsTree',
            description: 'View relationships between metrics',
        },
        {
            action: 'manage',
            subject: 'MetricsTree',
            description: 'Edit relationships between metrics in the tree',
        },
        {
            action: 'view',
            subject: 'Organization',
            description: 'View organization details',
        },
        {
            action: 'view',
            subject: 'OrganizationMemberProfile',
            description: 'View profiles of other organization members',
        },
        {
            action: 'view',
            subject: 'PinnedItems',
            description: 'See charts and dashboards pinned in spaces',
        },
        {
            action: 'manage',
            subject: 'PinnedItems',
            description: 'Pin and unpin charts and dashboards',
        },
        {
            action: 'view',
            subject: 'Project',
            description: 'View project metadata',
        },
        {
            action: 'view',
            subject: 'SavedChart',
            description: 'View saved charts in this project',
        },
        {
            action: 'manage',
            subject: 'SavedChart',
            description: 'Create, edit, and delete saved charts',
        },
        {
            action: 'create',
            subject: 'ScheduledDeliveries',
            description: 'Create scheduled deliveries of charts and dashboards',
        },
        {
            action: 'manage',
            subject: 'ScheduledDeliveries',
            description: 'Manage scheduled deliveries created by any user',
        },
        {
            action: 'view',
            subject: 'SemanticViewer',
            description: 'Open and explore the semantic viewer',
        },
        {
            action: 'manage',
            subject: 'SemanticViewer',
            description: 'Build and save semantic viewer queries',
        },
        {
            action: 'view',
            subject: 'Space',
            description: 'View spaces and their contents',
        },
        {
            action: 'create',
            subject: 'Space',
            description: 'Create new spaces in this project',
        },
        {
            action: 'manage',
            subject: 'Space',
            description: 'Edit space settings, sharing, and contents',
        },
        {
            action: 'view',
            subject: 'SpotlightTableConfig',
            description: 'View configuration of the Spotlight metric catalog',
        },
        {
            action: 'view',
            subject: 'Tags',
            description: 'View tags applied to content',
        },
        {
            action: 'manage',
            subject: 'Tags',
            description: 'Create, edit, and delete tags',
        },
        {
            action: 'view',
            subject: 'UnderlyingData',
            description: 'View the underlying rows behind a chart',
        },
    ],
    'org:admin': [
        {
            action: 'view',
            subject: 'AiAgent',
            description: 'View AI agents available in the organization',
        },
        {
            action: 'manage',
            subject: 'AiAgent',
            description: 'Create, configure, and delete AI agents',
        },
        {
            action: 'view',
            subject: 'AiAgentThread',
            description: 'View AI agent conversation threads',
        },
        {
            action: 'create',
            subject: 'AiAgentThread',
            description: 'Start new AI agent conversation threads',
        },
        {
            action: 'manage',
            subject: 'AiAgentThread',
            description: 'Manage all AI agent threads across users',
        },
        {
            action: 'view',
            subject: 'Analytics',
            description: 'View usage analytics and audit logs',
        },
        {
            action: 'manage',
            subject: 'ChangeCsvResults',
            description: 'Track and manage changes in CSV results',
        },
        {
            action: 'manage',
            subject: 'CompileProject',
            description: 'Compile dbt projects to refresh metadata',
        },
        {
            action: 'manage',
            subject: 'ContentAsCode',
            description: 'Download and upload Lightdash content as YAML files',
        },
        {
            action: 'manage',
            subject: 'ContentVerification',
            description: 'Mark charts and dashboards as verified content',
        },
        {
            action: 'manage',
            subject: 'CustomFields',
            description:
                'Create and edit custom dimensions and metrics on the fly',
        },
        {
            action: 'manage',
            subject: 'CustomSql',
            description: 'Use custom SQL when running queries',
        },
        {
            action: 'view',
            subject: 'Dashboard',
            description: 'View dashboards in this project',
        },
        {
            action: 'manage',
            subject: 'Dashboard',
            description: 'Create, edit, and delete dashboards',
        },
        {
            action: 'promote',
            subject: 'Dashboard',
            description: 'Promote dashboards to upstream projects',
        },
        {
            action: 'view',
            subject: 'DashboardComments',
            description: 'Read comments on dashboards',
        },
        {
            action: 'create',
            subject: 'DashboardComments',
            description: 'Add new comments to dashboards',
        },
        {
            action: 'manage',
            subject: 'DashboardComments',
            description: 'Edit and delete dashboard comments from any user',
        },
        {
            action: 'manage',
            subject: 'DataApp',
            description: 'Build and manage embedded data apps',
        },
        {
            action: 'manage',
            subject: 'DeployProject',
            description: 'Deploy projects and update their connections',
        },
        {
            action: 'manage',
            subject: 'Explore',
            description: 'Run queries against tables and explores',
        },
        {
            action: 'manage',
            subject: 'ExportCsv',
            description: 'Export query results to CSV files',
        },
        {
            action: 'manage',
            subject: 'Group',
            description: 'Create and manage user groups',
        },
        {
            action: 'manage',
            subject: 'InviteLink',
            description: 'Create and revoke organization invite links',
        },
        {
            action: 'view',
            subject: 'Job',
            description: 'View background job history',
        },
        {
            action: 'create',
            subject: 'Job',
            description: 'Trigger background jobs',
        },
        {
            action: 'manage',
            subject: 'Job',
            description: 'Manage all background jobs across users',
        },
        {
            action: 'view',
            subject: 'JobStatus',
            description: 'View live status of running jobs',
        },
        {
            action: 'view',
            subject: 'MetricsTree',
            description: 'View relationships between metrics',
        },
        {
            action: 'manage',
            subject: 'MetricsTree',
            description: 'Edit relationships between metrics in the tree',
        },
        {
            action: 'view',
            subject: 'Organization',
            description: 'View organization details',
        },
        {
            action: 'manage',
            subject: 'Organization',
            description: 'Edit organization settings such as name and defaults',
        },
        {
            action: 'view',
            subject: 'OrganizationMemberProfile',
            description: 'View profiles of other organization members',
        },
        {
            action: 'manage',
            subject: 'OrganizationMemberProfile',
            description:
                'Change member roles and remove members from the organization',
        },
        {
            action: 'view',
            subject: 'PinnedItems',
            description: 'See charts and dashboards pinned in spaces',
        },
        {
            action: 'manage',
            subject: 'PinnedItems',
            description: 'Pin and unpin charts and dashboards',
        },
        {
            action: 'manage',
            subject: 'PreAggregation',
            description: 'Configure caching of pre-aggregated query results',
        },
        {
            action: 'view',
            subject: 'Project',
            description: 'View project metadata',
        },
        {
            action: 'create',
            subject: 'Project',
            description: 'Create new projects in the organization',
        },
        {
            action: 'update',
            subject: 'Project',
            description: 'Update settings on existing projects',
        },
        {
            action: 'delete',
            subject: 'Project',
            description: 'Delete projects from the organization',
        },
        {
            action: 'manage',
            subject: 'Project',
            description: 'Full administrative control over projects',
        },
        {
            action: 'view',
            subject: 'SavedChart',
            description: 'View saved charts in this project',
        },
        {
            action: 'manage',
            subject: 'SavedChart',
            description: 'Create, edit, and delete saved charts',
        },
        {
            action: 'promote',
            subject: 'SavedChart',
            description: 'Promote saved charts to upstream projects',
        },
        {
            action: 'create',
            subject: 'ScheduledDeliveries',
            description: 'Create scheduled deliveries of charts and dashboards',
        },
        {
            action: 'manage',
            subject: 'ScheduledDeliveries',
            description: 'Manage scheduled deliveries created by any user',
        },
        {
            action: 'view',
            subject: 'SemanticViewer',
            description: 'Open and explore the semantic viewer',
        },
        {
            action: 'manage',
            subject: 'SemanticViewer',
            description: 'Build and save semantic viewer queries',
        },
        {
            action: 'view',
            subject: 'Space',
            description: 'View spaces and their contents',
        },
        {
            action: 'create',
            subject: 'Space',
            description: 'Create new spaces in this project',
        },
        {
            action: 'manage',
            subject: 'Space',
            description: 'Edit space settings, sharing, and contents',
        },
        {
            action: 'view',
            subject: 'SpotlightTableConfig',
            description: 'View configuration of the Spotlight metric catalog',
        },
        {
            action: 'manage',
            subject: 'SpotlightTableConfig',
            description:
                'Configure which tables and metrics appear in Spotlight',
        },
        {
            action: 'manage',
            subject: 'SqlRunner',
            description: 'Run ad-hoc SQL queries via the SQL runner',
        },
        {
            action: 'view',
            subject: 'Tags',
            description: 'View tags applied to content',
        },
        {
            action: 'manage',
            subject: 'Tags',
            description: 'Create, edit, and delete tags',
        },
        {
            action: 'view',
            subject: 'UnderlyingData',
            description: 'View the underlying rows behind a chart',
        },
        {
            action: 'manage',
            subject: 'Validation',
            description: 'Run project validation to check for errors',
        },
        {
            action: 'manage',
            subject: 'VirtualView',
            description: 'Create and edit virtual views',
        },
    ],
};

const getPermissionsForScopes = (scopes: string[]): Permission[] => {
    const seen = new Set<string>();
    const result: Permission[] = [];
    for (const scope of scopes) {
        const permissions = PERMISSIONS_BY_SCOPE[scope] ?? [];
        for (const permission of permissions) {
            const key = getPermissionKey(permission);
            if (!seen.has(key)) {
                seen.add(key);
                result.push(permission);
            }
        }
    }
    return result;
};

export const ServiceAccountPermissionsModal: FC<Props> = ({
    isOpen,
    onClose,
    serviceAccount,
}) => {
    const permissions = getPermissionsForScopes(serviceAccount?.scopes ?? []);
    const title = serviceAccount?.description
        ? `Permissions for ${serviceAccount.description}`
        : 'Permissions';

    return (
        <MantineModal
            opened={isOpen}
            onClose={onClose}
            title={title}
            size="xl"
            cancelLabel={false}
            modalBodyProps={{ px: 0, py: 0 }}
        >
            <Stack gap="sm">
                {permissions.length === 0 ? (
                    <Text fz="sm" c="dimmed">
                        No permissions granted by this service account's scopes.
                    </Text>
                ) : (
                    <Table
                        striped
                        withRowBorders
                        verticalSpacing="xs"
                        horizontalSpacing="md"
                    >
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th>Action</Table.Th>
                                <Table.Th>Resource</Table.Th>
                                <Table.Th>Description</Table.Th>
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {permissions.map((permission) => {
                                const key = getPermissionKey(permission);
                                return (
                                    <Table.Tr key={key}>
                                        <Table.Td>
                                            <Code fz="xs">
                                                {permission.action}
                                            </Code>
                                        </Table.Td>
                                        <Table.Td>
                                            <Code fz="xs">
                                                {permission.subject}
                                            </Code>
                                        </Table.Td>
                                        <Table.Td>
                                            <Text fz="sm" c="dimmed">
                                                {permission.description}
                                            </Text>
                                        </Table.Td>
                                    </Table.Tr>
                                );
                            })}
                        </Table.Tbody>
                    </Table>
                )}
            </Stack>
        </MantineModal>
    );
};
