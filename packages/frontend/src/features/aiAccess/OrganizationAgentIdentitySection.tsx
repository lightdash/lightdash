import {
    AGENT_IDENTITY_SOURCES,
    FeatureFlags,
    WarehouseTypes,
    type OrganizationAgentIdentityRule,
    type AiIdentitySource,
} from '@lightdash/common';
import { Anchor, Box, Group, Select, Stack, Text } from '@mantine/core';
import { IconAlertTriangle, IconCheck } from '@tabler/icons-react';
import { Fragment, useState } from 'react';
import { Link } from 'react-router';
import EmptyStateLoader from '../../components/common/EmptyStateLoader';
import InlineErrorState from '../../components/common/InlineErrorState';
import MantineIcon from '../../components/common/MantineIcon';
import { SettingsCard } from '../../components/common/Settings/SettingsCard';
import settingsClasses from '../../components/common/Settings/SettingsCard.module.css';
import { getWarehouseIcon } from '../../components/ProjectConnection/ProjectConnectFlow/utils';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../providers/App/useApp';
import AgentIdentityRuleConfirmModal from './AgentIdentityRuleConfirmModal';
import {
    useOrganizationAgentIdentitySettings,
    useUpdateOrganizationAgentIdentityRule,
} from './api';
import { identityLabels, identityWarehouseNames } from './identityLabels';
import { SnowflakeAgentSetup } from './SnowflakeAgentSetup';

const AgentIdentityRule = ({
    rule,
    configured,
}: {
    rule: OrganizationAgentIdentityRule;
    configured: boolean;
}) => {
    const save = useUpdateOrganizationAgentIdentityRule();
    const [pending, setPending] = useState(false);
    const [pendingSource, setPendingSource] = useState<Exclude<
        AiIdentitySource,
        'agent_sign_in'
    > | null>(null);

    const warehouseName =
        identityWarehouseNames[
            rule.warehouseType as keyof typeof identityWarehouseNames
        ];

    return (
        <Box
            className={settingsClasses.settingsGrid}
            data-testid={`${rule.warehouseType}-agent-identity-rule`}
        >
            <Group gap="sm" wrap="nowrap">
                {getWarehouseIcon(rule.warehouseType)}
                <Text size="sm" fw={500}>
                    {warehouseName}
                </Text>
            </Group>
            <Stack gap="xs">
                <Select
                    aria-label={`${warehouseName} agent identity`}
                    value={rule.source}
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
                    maw="100%"
                    onOptionSubmit={(value) => {
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
                        if (
                            source &&
                            source !== 'agent_sign_in' &&
                            source !== rule.source
                        )
                            setPendingSource(source);
                    }}
                />
                <Text size="sm" c="dimmed">
                    {pending
                        ? 'Not saved. Finish the setup below, then select Turn on.'
                        : identityLabels[rule.source].helper}
                </Text>
                {pendingSource !== null && (
                    <AgentIdentityRuleConfirmModal
                        warehouseType={rule.warehouseType}
                        source={pendingSource}
                        onClose={() => setPendingSource(null)}
                        saving={save.isLoading}
                        onConfirm={() =>
                            save.mutate(
                                {
                                    warehouseType: rule.warehouseType,
                                    source: pendingSource,
                                },
                                { onSuccess: () => setPendingSource(null) },
                            )
                        }
                    />
                )}
                {rule.projectsMissingAiServiceAccount &&
                    rule.projectsMissingAiServiceAccount.length > 0 && (
                        <Group
                            role="status"
                            gap="xs"
                            align="flex-start"
                            wrap="nowrap"
                        >
                            <MantineIcon
                                icon={IconAlertTriangle}
                                color="orange"
                                size="sm"
                            />
                            <Text size="sm" c="orange" flex={1}>
                                {rule.projectsMissingAiServiceAccount.length}{' '}
                                {rule.projectsMissingAiServiceAccount.length ===
                                1
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
                                                to={`/generalSettings/projectManagement/${project.projectUuid}/agentIdentity`}
                                            >
                                                {project.name}
                                            </Anchor>
                                        </Fragment>
                                    ))}
                                {rule.projectsMissingAiServiceAccount.length >
                                    3 &&
                                    ` and ${rule.projectsMissingAiServiceAccount.length - 3} more`}
                                .{' '}
                                {rule.projectsMissingAiServiceAccount.length ===
                                1
                                    ? 'Agents are refused on it until a project admin adds one.'
                                    : 'Agents are refused on them until a project admin adds one.'}
                            </Text>
                        </Group>
                    )}
                {rule.projectsMissingAiServiceAccount?.length === 0 && (
                    <Group role="status" gap="xs" wrap="nowrap">
                        <MantineIcon icon={IconCheck} color="green" size="sm" />
                        <Text size="sm" c="green" flex={1}>
                            Every {warehouseName} project has an AI service
                            account.
                        </Text>
                    </Group>
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
        </Box>
    );
};

const AgentIdentitySettings = () => {
    const settings = useOrganizationAgentIdentitySettings();
    if (settings.isLoading) return <EmptyStateLoader />;
    if (settings.isError)
        return (
            <InlineErrorState
                message="Could not load agent identity settings."
                onRetry={() => {
                    void settings.refetch();
                }}
            />
        );
    return (
        <Stack gap="lg">
            {settings.data?.rules
                .filter((rule) => rule.warehouseType in identityWarehouseNames)
                .map((rule) => (
                    <AgentIdentityRule
                        key={`${rule.warehouseType}-${rule.source}`}
                        rule={rule}
                        configured={settings.data?.snowflakeConfigured === true}
                    />
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
                    Choose who AI agents run as on each warehouse.
                </Text>
                <AgentIdentitySettings />
            </Stack>
        </SettingsCard>
    );
};

export default OrganizationAgentIdentitySection;
