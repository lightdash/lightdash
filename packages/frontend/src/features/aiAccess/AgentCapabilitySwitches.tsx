import { AgentCapability } from '@lightdash/common';
import {
    Accordion,
    Anchor,
    Badge,
    Group,
    Stack,
    Switch,
    Text,
} from '@mantine/core';
import { Trans, useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import Callout from '../../components/common/Callout';
import { agentPageCapabilityLabels } from './agentCapabilityLabels';
import { AgentCapabilityMatrix } from './AgentCapabilityMatrix';
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
    onChange,
    disabled,
}: {
    capabilities: AgentCapability[];
    draft: AgentPermissionDraft;
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
                        onChange(toggleAgentCapability(draft, capability))
                    }
                />
            ))}
        </Stack>
    );
};
export const AgentCapabilitySwitches = ({
    draft,
    onChange,
    disabled,
}: {
    draft: AgentPermissionDraft;
    onChange: (draft: AgentPermissionDraft) => void;
    disabled: boolean;
}) => {
    const rows = Object.values(draft.systemRoleMatrix);
    const firstRow = new Set(rows[0]);
    const { t } = useTranslation('aiAccess');
    const allowed = new Set(draft.allowedCapabilities);
    const sameRows = rows.every(
        (row) =>
            row.length === rows[0].length &&
            row.every((cap) => firstRow.has(cap)),
    );
    const developerCount = developer.filter((cap) => allowed.has(cap)).length;
    return (
        <Stack gap="md">
            <Stack gap="xs">
                <Text size="xs" fw={500} c="dimmed">
                    {t('capabilitySwitches.readAndQuery')}
                </Text>
                <CapabilitySwitchGroup
                    capabilities={readAndQueryCapabilities}
                    draft={draft}
                    onChange={onChange}
                    disabled={disabled}
                />
            </Stack>
            <Stack gap="xs">
                <Text size="xs" fw={500} c="dimmed">
                    {t('capabilitySwitches.makeChanges')}
                </Text>
                <CapabilitySwitchGroup
                    capabilities={changes}
                    draft={draft}
                    onChange={onChange}
                    disabled={disabled}
                />
            </Stack>
            <Accordion variant="separated" multiple>
                <Accordion.Item value="developer">
                    <Accordion.Control>
                        <Stack gap={0}>
                            <Text size="sm" fw={500}>
                                {t('capabilitySwitches.developerTitle')}
                            </Text>
                            <Text size="xs" c="dimmed">
                                {t('capabilitySwitches.developerDescription')}{' '}
                                {developerCount === 4
                                    ? t('capabilitySwitches.allOn')
                                    : developerCount === 0
                                      ? t('capabilitySwitches.allOff')
                                      : t('capabilitySwitches.countOn', {
                                            count: developerCount,
                                        })}
                            </Text>
                        </Stack>
                    </Accordion.Control>
                    <Accordion.Panel>
                        <CapabilitySwitchGroup
                            capabilities={developer}
                            draft={draft}
                            onChange={onChange}
                            disabled={disabled}
                        />
                    </Accordion.Panel>
                </Accordion.Item>
                <Accordion.Item value="roles">
                    <Accordion.Control>
                        <Stack gap={0}>
                            <Group gap="xs">
                                <Text size="sm" fw={500}>
                                    {t('capabilitySwitches.perRoleTitle')}
                                </Text>
                                <Badge size="xs">
                                    {t('capabilitySwitches.advanced')}
                                </Badge>
                            </Group>
                            <Text size="xs" c="dimmed">
                                {sameRows
                                    ? t('capabilitySwitches.sameRoles')
                                    : t('capabilitySwitches.differentRoles')}
                            </Text>
                        </Stack>
                    </Accordion.Control>
                    <Accordion.Panel>
                        <AgentCapabilityMatrix
                            matrix={draft.systemRoleMatrix}
                            allowedCapabilities={draft.allowedCapabilities}
                            disabled={disabled}
                            onChange={(systemRoleMatrix) =>
                                onChange({ ...draft, systemRoleMatrix })
                            }
                        />
                    </Accordion.Panel>
                </Accordion.Item>
            </Accordion>
            <Callout variant="info">
                <Stack gap="xs">
                    <Text size="sm">{t('capabilitySwitches.limitsApply')}</Text>
                    <Text size="sm">
                        <Trans
                            t={t}
                            i18nKey="capabilitySwitches.customRolesNote"
                            components={{
                                anchor: (
                                    <Anchor
                                        component={Link}
                                        to="/generalSettings/customRoles"
                                        size="sm"
                                    />
                                ),
                            }}
                        />
                    </Text>
                </Stack>
            </Callout>
            {draft.allowedCapabilities.length === 0 && (
                <Text size="sm">{t('capabilitySwitches.turnedOff')}</Text>
            )}
        </Stack>
    );
};
