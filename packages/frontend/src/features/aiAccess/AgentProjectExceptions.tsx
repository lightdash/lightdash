import {
    getProjectAgentIdentitySettingsPath,
    type AgentProjectCapabilityPolicy,
} from '@lightdash/common';
import { Anchor, Group, Select, Stack, Text } from '@mantine/core';
import { Link, useNavigate } from 'react-router';
import { SettingsSection } from '../../components/common/Settings/SettingLayout';
import { SettingsCard } from '../../components/common/Settings/SettingsCard';
import { agentPageCapabilityLabels } from './agentCapabilityLabels';
import { useProjectAgentPolicies } from './api';

const allCapabilities = Object.keys(
    agentPageCapabilityLabels,
) as (keyof typeof agentPageCapabilityLabels)[];

const summarize = ({ allowedCapabilities }: AgentProjectCapabilityPolicy) => {
    if (allowedCapabilities === null) return 'No restrictions';
    if (allowedCapabilities.length === 0) return 'Restrict: agents off';
    const off = allCapabilities.filter(
        (capability) => !allowedCapabilities.includes(capability),
    );
    if (off.length === 0) return 'Restrict: everything on';
    return off.length <= 2
        ? `Restrict: ${off.map((capability) => agentPageCapabilityLabels[capability].label).join(', ')} off`
        : `Restrict: ${off.length} actions off`;
};

export const AgentProjectExceptions = ({
    projects,
}: {
    projects: { projectUuid: string; name: string }[];
}) => {
    const navigate = useNavigate();
    const { data: policies } = useProjectAgentPolicies();
    if (!policies) return null;
    const names = new Map(
        projects.map((project) => [project.projectUuid, project.name]),
    );
    const listed = policies.filter((policy) => names.has(policy.projectUuid));
    const unlisted = projects.filter(
        (project) =>
            !policies.some(
                (policy) => policy.projectUuid === project.projectUuid,
            ),
    );
    return (
        <SettingsSection
            label="Projects with their own setting"
            description="A project's own setting replaces the organization setting for that project. All other projects use the organization setting."
        >
            <SettingsCard>
                <Stack gap="sm">
                    {listed.length === 0 && (
                        <Text size="sm" c="dimmed">
                            Every project uses the organization setting.
                        </Text>
                    )}
                    {listed.map((policy) => (
                        <Group
                            key={policy.projectUuid}
                            justify="space-between"
                            wrap="nowrap"
                        >
                            <Stack gap={0}>
                                <Text size="sm" fw={500}>
                                    {names.get(policy.projectUuid)}
                                </Text>
                                <Text size="xs" c="dimmed">
                                    {summarize(policy)}
                                </Text>
                            </Stack>
                            <Anchor
                                component={Link}
                                to={getProjectAgentIdentitySettingsPath(
                                    policy.projectUuid,
                                )}
                                size="sm"
                                aria-label={`Edit ${names.get(policy.projectUuid)}`}
                            >
                                Edit
                            </Anchor>
                        </Group>
                    ))}
                    {unlisted.length > 0 && (
                        <Select
                            label="Add a project"
                            placeholder="Choose a project"
                            searchable
                            value={null}
                            data={unlisted.map((project) => ({
                                value: project.projectUuid,
                                label: project.name,
                            }))}
                            onChange={(projectUuid) => {
                                if (projectUuid)
                                    void navigate(
                                        getProjectAgentIdentitySettingsPath(
                                            projectUuid,
                                        ),
                                    );
                            }}
                        />
                    )}
                </Stack>
            </SettingsCard>
        </SettingsSection>
    );
};
