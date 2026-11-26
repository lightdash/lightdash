import {
    AgentCapability,
    type AgentCapabilityPolicy,
    type AgentProjectCapabilityPolicy,
} from '@lightdash/common';
import { Box, Button, Group, Radio, Stack, Text } from '@mantine/core';
import { useState } from 'react';
import { SettingsSection } from '../../components/common/Settings/SettingLayout';
import { SettingsCard } from '../../components/common/Settings/SettingsCard';
import { AgentCapabilitySwitches } from './AgentCapabilitySwitches';
import { type AgentPermissionDraft } from './agentPermissionDraft';
import classes from './AgentPermissionsSection.module.css';
import {
    useAgentCapabilityPolicy,
    useDeleteProjectAgentPolicy,
    useProjectAgentPolicies,
    useSaveProjectAgentPolicy,
} from './api';

type Choice = 'organization' | 'none' | 'restrict';
type Restrictions = { choice: Choice; allowed: AgentCapability[] };

const allCapabilities = Object.values(AgentCapability);

const choiceLabels: Record<Choice, string> = {
    organization: 'Use organization setting',
    none: 'No restrictions',
    restrict: 'Restrict',
};

const describeOrganization = (policy: AgentCapabilityPolicy | undefined) => {
    if (!policy) return 'Follows the organization.';
    return policy.mode === 'legacy' || policy.allowedCapabilities === null
        ? 'Currently: No restrictions.'
        : 'Currently: Restrict.';
};

const toRestrictions = (
    saved: AgentProjectCapabilityPolicy | undefined,
    organization: AgentCapabilityPolicy | undefined,
): Restrictions => {
    // Switches start from what applies today, so choosing "Restrict" never
    // loosens the project by accident.
    const inherited =
        organization?.mode === 'managed' &&
        organization.allowedCapabilities !== null
            ? organization.allowedCapabilities
            : allCapabilities;
    if (!saved) return { choice: 'organization', allowed: inherited };
    return saved.allowedCapabilities === null
        ? { choice: 'none', allowed: inherited }
        : { choice: 'restrict', allowed: saved.allowedCapabilities };
};

const sameRestrictions = (a: Restrictions, b: Restrictions) =>
    a.choice === b.choice &&
    (a.choice !== 'restrict' ||
        (a.allowed.length === b.allowed.length &&
            a.allowed.every((capability) => b.allowed.includes(capability))));

const RestrictionsForm = ({
    projectUuid,
    saved,
    organization,
}: {
    projectUuid: string;
    saved: Restrictions;
    organization: AgentCapabilityPolicy | undefined;
}) => {
    const [draft, setDraft] = useState(saved);
    const save = useSaveProjectAgentPolicy(projectUuid);
    const remove = useDeleteProjectAgentPolicy(projectUuid);
    const saving = save.isLoading || remove.isLoading;
    const changed = !sameRestrictions(draft, saved);
    const switchDraft: AgentPermissionDraft = {
        mode: 'managed',
        version: 0,
        allowedGroupUuids: null,
        allowedCapabilities: draft.allowed,
    };
    const descriptions: Record<Choice, string> = {
        organization: describeOrganization(organization),
        none: 'Agents can do everything the person can.',
        restrict: 'Choose what agents can do in this project.',
    };
    return (
        <Stack gap="md">
            <Radio.Group
                value={draft.choice}
                aria-label="Restrict agent actions in this project"
            >
                <Stack gap="sm">
                    {(Object.keys(choiceLabels) as Choice[]).map((value) => (
                        <Box
                            key={value}
                            className={classes.choice}
                            data-selected={draft.choice === value}
                        >
                            <Radio.Card
                                value={value}
                                aria-label={choiceLabels[value]}
                                disabled={saving}
                                onClick={() =>
                                    setDraft({ ...draft, choice: value })
                                }
                                className={classes.choiceControl}
                            >
                                <Group wrap="nowrap" align="flex-start">
                                    <Radio.Indicator disabled={saving} />
                                    <Stack gap={0}>
                                        <Text fz="sm" fw={500}>
                                            {choiceLabels[value]}
                                        </Text>
                                        <Text fz="xs" c="dimmed">
                                            {descriptions[value]}
                                        </Text>
                                    </Stack>
                                </Group>
                            </Radio.Card>
                            {draft.choice === value && value === 'restrict' && (
                                <Stack gap="xs" className={classes.choiceBody}>
                                    <Text fz="sm" fw={500}>
                                        Agents can:
                                    </Text>
                                    <AgentCapabilitySwitches
                                        scope="project"
                                        draft={switchDraft}
                                        disabled={saving}
                                        onChange={(next) =>
                                            setDraft({
                                                ...draft,
                                                allowed:
                                                    next.allowedCapabilities,
                                            })
                                        }
                                    />
                                </Stack>
                            )}
                        </Box>
                    ))}
                </Stack>
            </Radio.Group>
            <Group justify="space-between" align="center" gap="md">
                <Text fz="xs" c="dimmed" className={classes.note}>
                    Only organization admins can change this.
                </Text>
                <Group gap="sm" ml="auto">
                    {changed && (
                        <Button
                            variant="subtle"
                            disabled={saving}
                            onClick={() => setDraft(saved)}
                        >
                            Discard
                        </Button>
                    )}
                    <Button
                        disabled={!changed}
                        loading={saving}
                        onClick={() => {
                            if (draft.choice === 'organization')
                                remove.mutate(undefined);
                            else
                                save.mutate({
                                    allowedCapabilities:
                                        draft.choice === 'none'
                                            ? null
                                            : draft.allowed,
                                });
                        }}
                    >
                        Save
                    </Button>
                </Group>
            </Group>
        </Stack>
    );
};

export const ProjectAgentRestrictions = ({
    projectUuid,
}: {
    projectUuid: string;
}) => {
    const { data: organization } = useAgentCapabilityPolicy();
    const { data: policies } = useProjectAgentPolicies();
    if (!policies) return null;
    const saved = toRestrictions(
        policies.find((policy) => policy.projectUuid === projectUuid),
        organization,
    );
    return (
        <SettingsSection
            label="Restrict agent actions in this project"
            description="Agents never gain permissions their user doesn't have. A project's own setting replaces the organization setting for this project."
        >
            <SettingsCard>
                <RestrictionsForm
                    // Reset the form whenever the saved setting changes.
                    key={`${saved.choice}:${saved.allowed.join(',')}`}
                    projectUuid={projectUuid}
                    saved={saved}
                    organization={organization}
                />
            </SettingsCard>
        </SettingsSection>
    );
};
