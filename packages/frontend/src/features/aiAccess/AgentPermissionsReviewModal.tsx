import {
    OrganizationMemberRoleLabels,
    type Group as OrganizationGroup,
    type AgentCapability,
} from '@lightdash/common';
import { Stack, Text } from '@mantine/core';
import Callout from '../../components/common/Callout';
import MantineModal from '../../components/common/MantineModal';
import { agentPageCapabilityLabels } from './agentCapabilityLabels';
import { type AgentPermissionChanges } from './agentPermissionDraft';
import { agentGroupName } from './agentPermissionLabels';

const names = (caps: AgentCapability[]) =>
    caps.map((cap) => agentPageCapabilityLabels[cap].label).join(' and ');
export const AgentPermissionsReviewModal = ({
    changes,
    groups,
    saving,
    disabled,
    error,
    onClose,
    onSave,
}: {
    changes: AgentPermissionChanges;
    groups: OrganizationGroup[];
    saving: boolean;
    disabled: boolean;
    error: string | null;
    onClose: () => void;
    onSave: () => void;
}) => (
    <MantineModal
        opened
        title="Review changes to agent permissions"
        onClose={onClose}
        cancelLabel="Back"
        confirmLabel="Save changes"
        confirmLoading={saving}
        confirmDisabled={disabled}
        cancelDisabled={saving}
        onConfirm={onSave}
    >
        <Stack gap="lg">
            {error && <Callout variant="danger">{error}</Callout>}
            {changes.turnedOff ? (
                <Stack gap="xs">
                    <Text size="xs" c="red" fw={500}>
                        STOPS
                    </Text>
                    <Text fw={500}>Agents are turned off for everyone</Text>
                    <Text size="sm">
                        No one can use Ask AI, the Slack agent, MCP clients or
                        the CLI. People can still work themselves.
                    </Text>
                </Stack>
            ) : (
                changes.stops.length > 0 && (
                    <Stack gap="xs">
                        <Text size="xs" c="red" fw={500}>
                            STOPS
                        </Text>
                        <Text>
                            <Text span fw={500}>
                                {names(changes.stops)}
                            </Text>{' '}
                            for agents
                        </Text>
                        <Text size="sm">
                            For every role, custom roles included. People can
                            still do these themselves.
                        </Text>
                    </Stack>
                )
            )}
            {changes.allows.length > 0 && (
                <Stack gap="xs">
                    <Text size="xs" fw={500}>
                        ALLOWS
                    </Text>
                    <Text fw={500}>{names(changes.allows)}</Text>
                    <Text size="sm">
                        These limits are removed. A person’s own permissions
                        still apply.
                    </Text>
                </Stack>
            )}
            {!changes.turnedOff &&
                changes.roles.map((row) => (
                    <Stack gap="xs" key={row.role}>
                        <Text fw={500}>
                            {OrganizationMemberRoleLabels[row.role]}
                        </Text>
                        {row.stops.length > 0 && (
                            <Text>STOPS: {names(row.stops)}</Text>
                        )}
                        {row.allows.length > 0 && (
                            <Text>ALLOWS: {names(row.allows)}</Text>
                        )}
                        <Text size="sm">
                            Other roles, including custom roles, can still allow
                            these actions within the limits for everyone.
                        </Text>
                    </Stack>
                ))}
            {changes.groups && (
                <Stack gap="xs">
                    <Text size="xs" c="blue" fw={500}>
                        WHO
                    </Text>
                    {changes.groups.allowedGroupUuids === null ? (
                        <Text>
                            Everyone whose role allows AI can use agents
                        </Text>
                    ) : (
                        <>
                            <Text>
                                Only members of{' '}
                                <Text span fw={500}>
                                    {changes.groups.allowedGroupUuids
                                        .map((uuid) =>
                                            agentGroupName(uuid, groups),
                                        )
                                        .join(' and ')}
                                </Text>{' '}
                                can use agents
                            </Text>
                            <Text size="sm">
                                Other people lose access to Ask AI, the Slack
                                agent, MCP clients and the CLI.
                            </Text>
                        </>
                    )}
                </Stack>
            )}
            {changes.mode !== null && (
                <Text size="sm">
                    {changes.mode === 'legacy'
                        ? 'Agents follow each person’s permissions again.'
                        : 'Agent limits are turned on.'}
                </Text>
            )}
            <Callout variant="info">
                Agents never get more access than the person. Personal access
                tokens are not limited.
            </Callout>
        </Stack>
    </MantineModal>
);
