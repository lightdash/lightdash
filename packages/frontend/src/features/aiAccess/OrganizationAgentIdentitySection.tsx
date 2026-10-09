import {
    AGENT_IDENTITY_SOURCES,
    FeatureFlags,
    WarehouseTypes,
    type OrganizationAgentIdentityRule,
} from '@lightdash/common';
import { Anchor, Group, Select, Stack, Text } from '@mantine/core';
import { Fragment, useState } from 'react';
import { Link } from 'react-router';
import EmptyStateLoader from '../../components/common/EmptyStateLoader';
import InlineErrorState from '../../components/common/InlineErrorState';
import { SettingsCard } from '../../components/common/Settings/SettingsCard';
import { getWarehouseIcon } from '../../components/ProjectConnection/ProjectConnectFlow/utils';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../providers/App/useApp';
import {
    useOrganizationAgentIdentitySettings,
    useUpdateOrganizationAgentIdentityRule,
} from './api';
import {
    agentIdentitySentence,
    identityLabels,
    identityWarehouseNames,
} from './identityLabels';
import { SnowflakeAgentSetup } from './SnowflakeAgentSetup';

const AgentIdentityRule = ({
    rule,
}: {
    rule: OrganizationAgentIdentityRule;
}) => {
    const { health } = useApp();
    const save = useUpdateOrganizationAgentIdentityRule();
    const configured = health.data?.auth.snowflakeAi.enabled === true;
    const [pending, setPending] = useState(false);
    const source = pending ? 'agent_sign_in' : rule.source;

    return (
        <Stack gap="xs">
            <Group gap="sm">
                {getWarehouseIcon(rule.warehouseType)}
                <Text size="sm">
                    {agentIdentitySentence(
                        identityWarehouseNames[
                            rule.warehouseType as keyof typeof identityWarehouseNames
                        ],
                    )}
                </Text>
                <Select
                    aria-label={`${identityWarehouseNames[rule.warehouseType as keyof typeof identityWarehouseNames]} agent identity`}
                    value={source}
                    data={AGENT_IDENTITY_SOURCES[rule.warehouseType].person.map(
                        (source) => ({
                            value: source,
                            label: identityLabels[source].label,
                        }),
                    )}
                    renderOption={({ option }) => (
                        <Stack gap={0}>
                            <Text size="sm">{option.label}</Text>
                            {option.value === 'agent_sign_in' &&
                                !configured && (
                                    <Text size="xs" c="dimmed">
                                        Needs a one-time Snowflake setup
                                    </Text>
                                )}
                        </Stack>
                    )}
                    allowDeselect={false}
                    disabled={save.isLoading}
                    w={340}
                    onChange={(value) => {
                        const source = AGENT_IDENTITY_SOURCES[
                            rule.warehouseType
                        ].person.find((allowed) => allowed === value);
                        if (
                            source === 'agent_sign_in' &&
                            rule.warehouseType === WarehouseTypes.SNOWFLAKE &&
                            rule.source !== 'agent_sign_in'
                        ) {
                            setPending(true);
                            return;
                        }
                        setPending(false);
                        if (source && source !== rule.source)
                            save.mutate({
                                warehouseType: rule.warehouseType,
                                source,
                            });
                    }}
                />
            </Group>
            <Text size="sm" c="dimmed">
                {identityLabels[source].helper}
            </Text>
            {rule.projectsMissingAiServiceAccount &&
                rule.projectsMissingAiServiceAccount.length > 0 && (
                    <Text size="sm" c="orange">
                        {rule.projectsMissingAiServiceAccount.length}{' '}
                        {rule.projectsMissingAiServiceAccount.length === 1
                            ? 'project has'
                            : 'projects have'}{' '}
                        no AI service account:{' '}
                        {rule.projectsMissingAiServiceAccount
                            .slice(0, 3)
                            .map((project, index) => (
                                <Fragment key={project.projectUuid}>
                                    {index > 0 && ', '}
                                    <Anchor
                                        component={Link}
                                        size="sm"
                                        to={`/generalSettings/projectManagement/${project.projectUuid}/settings`}
                                    >
                                        {project.name}
                                    </Anchor>
                                </Fragment>
                            ))}
                        {rule.projectsMissingAiServiceAccount.length > 3 &&
                            ` and ${rule.projectsMissingAiServiceAccount.length - 3} more`}
                        .{' '}
                        {rule.projectsMissingAiServiceAccount.length === 1
                            ? 'Agents are refused on it until a project admin adds one.'
                            : 'Agents are refused on them until a project admin adds one.'}
                    </Text>
                )}
            {rule.warehouseType === WarehouseTypes.SNOWFLAKE &&
                (pending ? (
                    <SnowflakeAgentSetup
                        key="pending"
                        mode="pending"
                        saving={save.isLoading}
                        onCancel={() => setPending(false)}
                        onTurnOn={() =>
                            save.mutate(
                                {
                                    warehouseType: rule.warehouseType,
                                    source: 'agent_sign_in',
                                },
                                { onSuccess: () => setPending(false) },
                            )
                        }
                    />
                ) : rule.source === 'agent_sign_in' ? (
                    <SnowflakeAgentSetup key="active" mode="active" />
                ) : null)}
        </Stack>
    );
};

const AgentIdentitySettings = () => {
    const { health } = useApp();
    const settings = useOrganizationAgentIdentitySettings();
    if (settings.isLoading || health.isLoading) return <EmptyStateLoader />;
    if (settings.isError || health.isError)
        return (
            <InlineErrorState
                message="Could not load agent identity settings."
                onRetry={() => {
                    void settings.refetch();
                    void health.refetch();
                }}
            />
        );
    return (
        <Stack gap="lg">
            {settings.data?.rules
                .filter((rule) => rule.warehouseType in identityWarehouseNames)
                .map((rule) => (
                    <AgentIdentityRule key={rule.warehouseType} rule={rule} />
                ))}
        </Stack>
    );
};

const OrganizationAgentIdentitySection = () => {
    const { user } = useApp();
    const { data: flag } = useServerFeatureFlag(FeatureFlags.AgentIdentity);
    if (!flag?.enabled || !user.data?.ability.can('manage', 'Organization'))
        return null;
    return (
        <SettingsCard>
            <Stack gap="md">
                <Text size="sm" c="dimmed">
                    Choose who AI agents run as for each warehouse in your
                    organisation.
                </Text>
                <AgentIdentitySettings />
            </Stack>
        </SettingsCard>
    );
};

export default OrganizationAgentIdentitySection;
