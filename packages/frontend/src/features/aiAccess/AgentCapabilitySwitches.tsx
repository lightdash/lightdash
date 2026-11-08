import { AgentCapability } from '@lightdash/common';
import { Accordion, Anchor, Stack, Switch, Text } from '@mantine/core';
import { Link } from 'react-router';
import Callout from '../../components/common/Callout';
import { agentPageCapabilityLabels } from './agentCapabilityLabels';
import {
    readAndQueryCapabilities,
    toggleAgentCapability,
    type AgentPermissionDraft,
} from './agentPermissionDraft';
import classes from './AgentPermissionsSection.module.css';

const changes = [
    AgentCapability.ContentWrite,
    AgentCapability.Delete,
    AgentCapability.Publish,
];
const developer = [
    AgentCapability.DeployUpload,
    AgentCapability.DbtWriteback,
    AgentCapability.Administration,
    AgentCapability.ExternalTools,
];
const CapabilitySwitchGroup = ({
    capabilities,
    draft,
    baseline,
    onChange,
    disabled,
}: {
    capabilities: AgentCapability[];
    draft: AgentPermissionDraft;
    baseline: AgentPermissionDraft;
    onChange: (draft: AgentPermissionDraft) => void;
    disabled: boolean;
}) => {
    const allowed = new Set(draft.allowedCapabilities);
    return (
        <Stack gap={0}>
            {capabilities.map((capability) => (
                <Switch
                    key={capability}
                    className={classes.switchRow}
                    aria-label={agentPageCapabilityLabels[capability].label}
                    label={agentPageCapabilityLabels[capability].label}
                    description={
                        agentPageCapabilityLabels[capability].description
                    }
                    checked={allowed.has(capability)}
                    disabled={disabled}
                    onChange={() =>
                        onChange(
                            toggleAgentCapability(draft, capability, baseline),
                        )
                    }
                />
            ))}
        </Stack>
    );
};
export const AgentCapabilitySwitches = ({
    draft,
    baseline,
    onChange,
    disabled,
}: {
    draft: AgentPermissionDraft;
    baseline: AgentPermissionDraft;
    onChange: (draft: AgentPermissionDraft) => void;
    disabled: boolean;
}) => {
    const allowed = new Set(draft.allowedCapabilities);
    const developerCount = developer.filter((cap) => allowed.has(cap)).length;
    return (
        <Stack gap="md">
            <Stack gap="xs">
                <Text size="xs" fw={500} c="dimmed">
                    READ AND QUERY
                </Text>
                <CapabilitySwitchGroup
                    capabilities={readAndQueryCapabilities}
                    draft={draft}
                    baseline={baseline}
                    onChange={onChange}
                    disabled={disabled}
                />
            </Stack>
            <Stack gap="xs">
                <Text size="xs" fw={500} c="dimmed">
                    MAKE CHANGES
                </Text>
                <CapabilitySwitchGroup
                    capabilities={changes}
                    draft={draft}
                    baseline={baseline}
                    onChange={onChange}
                    disabled={disabled}
                />
            </Stack>
            <Accordion variant="separated" multiple>
                <Accordion.Item value="developer">
                    <Accordion.Control>
                        <Stack gap={0}>
                            <Text size="sm" fw={500}>
                                Developer and admin
                            </Text>
                            <Text size="xs" c="dimmed">
                                Deploy and upload, Git repository changes (dbt),
                                Administration, External tools.{' '}
                                {developerCount === 4
                                    ? 'All on.'
                                    : developerCount === 0
                                      ? 'All off.'
                                      : `${developerCount} on.`}
                            </Text>
                        </Stack>
                    </Accordion.Control>
                    <Accordion.Panel>
                        <CapabilitySwitchGroup
                            capabilities={developer}
                            draft={draft}
                            baseline={baseline}
                            onChange={onChange}
                            disabled={disabled}
                        />
                    </Accordion.Panel>
                </Accordion.Item>
            </Accordion>
            <Callout variant="info">
                <Stack gap="xs">
                    <Text size="sm">
                        These limits apply to every role, custom roles included.
                        A person never gets more than their own permissions.
                    </Text>
                    <Text size="sm">
                        Custom roles keep their own agent permissions.{' '}
                        <Anchor
                            component={Link}
                            to="/generalSettings/customRoles"
                            size="sm"
                        >
                            Custom roles
                        </Anchor>
                    </Text>
                </Stack>
            </Callout>
            {draft.allowedCapabilities.length === 0 && (
                <Text size="sm">Agents are turned off for everyone.</Text>
            )}
        </Stack>
    );
};
