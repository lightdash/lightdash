import {
    type AgentCapabilityPolicyOverview,
    type ApiAiOrganizationSettingsResponse,
    type Group as OrganizationGroup,
} from '@lightdash/common';
import { Anchor, Button, Group, Stack, Text, Title } from '@mantine/core';
import { useState } from 'react';
import Callout from '../../components/common/Callout';
import { SettingsCard } from '../../components/common/Settings/SettingsCard';
import { AgentCapabilityChoices } from './AgentCapabilityChoices';
import { AgentCapabilitySwitches } from './AgentCapabilitySwitches';
import { AgentGroupAdmissionSection } from './AgentGroupAdmissionSection';
import { AgentMcpAccessSwitch } from './AgentMcpAccessSwitch';
import {
    chooseAgentPermission,
    getAgentPermissionChoice,
} from './agentPermissionDraft';
import { agentPermissionChoiceLabels } from './agentPermissionLabels';
import { AgentPermissionsReviewModal } from './AgentPermissionsReviewModal';
import classes from './AgentPermissionsSection.module.css';
import { type useAgentCapabilityPolicy } from './api';
import { useAgentPermissionsForm } from './useAgentPermissionsForm';

export const AgentPermissionsSection = ({
    policy,
    groups,
    refetchPolicy,
    loadError,
    mcpSettings,
}: {
    policy: AgentCapabilityPolicyOverview;
    groups: OrganizationGroup[];
    refetchPolicy: ReturnType<typeof useAgentCapabilityPolicy>['refetch'];
    loadError: boolean;
    mcpSettings: ApiAiOrganizationSettingsResponse['results'] | null;
}) => {
    const {
        baseline,
        form,
        choice,
        setChoice,
        reviewOpened,
        setReviewOpened,
        changes,
        count,
        accept,
        saving,
        conflict,
        disabled,
        invalidGroups,
        saveDisabled,
        saveError,
        reload,
        submit,
    } = useAgentPermissionsForm({ policy, refetchPolicy, loadError });
    const [whoExpanded, setWhoExpanded] = useState(false);
    return (
        <SettingsCard>
            <Stack gap="lg">
                <Stack gap="xs">
                    <Title order={5}>Permissions</Title>
                    <Text size="sm" c="dimmed">
                        What agents may do for a person. Agents never get more
                        than the person has.
                    </Text>
                </Stack>
                {conflict && (
                    <Callout
                        variant="warning"
                        title="Agent permissions changed"
                    >
                        <Stack gap="sm">
                            <Text size="sm">
                                Someone changed the saved permissions. Your
                                unsaved changes are still shown. Reload the
                                latest permissions to discard them.
                            </Text>
                            <Button
                                variant="default"
                                disabled={saving}
                                onClick={() => void reload()}
                            >
                                Reload latest
                            </Button>
                        </Stack>
                    </Callout>
                )}
                <Stack gap="sm">
                    <Group justify="space-between">
                        <Stack gap={0}>
                            <Title order={5}>What agents can do</Title>
                            {whoExpanded && (
                                <Text size="sm" c="dimmed">
                                    {agentPermissionChoiceLabels[choice]}.
                                </Text>
                            )}
                        </Stack>
                        {whoExpanded && (
                            <Button
                                variant="default"
                                aria-label="Change what agents can do"
                                onClick={() => setWhoExpanded(false)}
                            >
                                Change
                            </Button>
                        )}
                    </Group>
                    {!whoExpanded && (
                        <AgentCapabilityChoices
                            choice={choice}
                            current={getAgentPermissionChoice(baseline)}
                            disabled={disabled}
                            onChange={(value) => {
                                setChoice(value);
                                form.setValues(
                                    choice === value
                                        ? form.values
                                        : chooseAgentPermission(
                                              form.values,
                                              value,
                                              baseline,
                                          ),
                                );
                            }}
                        >
                            <AgentCapabilitySwitches
                                draft={form.values}
                                onChange={form.setValues}
                                disabled={disabled}
                            />
                        </AgentCapabilityChoices>
                    )}
                </Stack>
                <AgentGroupAdmissionSection
                    available={policy.groupsAvailable}
                    groups={groups}
                    selection={form.values.allowedGroupUuids}
                    savedSelection={baseline.allowedGroupUuids}
                    expanded={whoExpanded}
                    onExpand={() => setWhoExpanded(true)}
                    onChange={(value) =>
                        form.setFieldValue('allowedGroupUuids', value)
                    }
                    disabled={disabled || loadError}
                    invalid={invalidGroups}
                />
                {mcpSettings && (
                    <AgentMcpAccessSwitch
                        settings={mcpSettings}
                        setting="mcpAgentsEnabled"
                        label="Agents over MCP"
                        description="MCP clients can use this organization's agents and their context. Per-agent access still applies."
                    />
                )}
                <Stack gap="md" className={classes.footer}>
                    <Text size="sm" c="dimmed">
                        Personal access tokens are not limited. An agent that
                        uses a person's token has that person's access.{' '}
                        <Anchor
                            href="https://docs.lightdash.com/references/personal_tokens"
                            target="_blank"
                            rel="noreferrer"
                            size="sm"
                        >
                            Learn more
                        </Anchor>
                    </Text>
                    <Group justify="flex-end">
                        <Text size="sm" c="dimmed" role="status">
                            {count === 0
                                ? 'No changes'
                                : `${count} unsaved ${count === 1 ? 'change' : 'changes'}`}
                        </Text>
                        {count > 0 && (
                            <Button
                                variant="subtle"
                                disabled={saving}
                                onClick={() => accept(policy)}
                            >
                                Discard
                            </Button>
                        )}
                        <Button
                            disabled={saveDisabled}
                            onClick={() => setReviewOpened(true)}
                        >
                            Review and save
                        </Button>
                    </Group>
                </Stack>
                {reviewOpened && !conflict && (
                    <AgentPermissionsReviewModal
                        changes={changes}
                        groups={groups}
                        saving={saving}
                        disabled={saveDisabled}
                        error={saveError}
                        onClose={() => {
                            if (!saving) setReviewOpened(false);
                        }}
                        onSave={submit}
                    />
                )}
            </Stack>
        </SettingsCard>
    );
};
