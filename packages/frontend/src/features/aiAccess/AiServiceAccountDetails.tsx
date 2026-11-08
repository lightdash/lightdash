import {
    getProjectAgentIdentitySettingsPath,
    type AiServiceAccountParent,
    type AiServiceAccountSlot,
    type AiServiceAccountTestResult,
    type AiServiceAccountWarehouse,
} from '@lightdash/common';
import { Anchor, Stack, Text } from '@mantine/core';
import { Link } from 'react-router';
import { agentIdentityWarehouses } from './agentIdentityWarehouses';
import { formatAiServiceAccountDate } from './formatAiServiceAccountDate';

export const AiServiceAccountDetails = ({
    slot,
    parent,
    testedPrincipal,
    observation,
    warehouseType,
}: {
    slot: AiServiceAccountSlot | null;
    parent: AiServiceAccountParent | null;
    testedPrincipal: string | null;
    observation: AiServiceAccountTestResult | null;
    warehouseType: AiServiceAccountWarehouse;
}) => {
    const warehouse = agentIdentityWarehouses[warehouseType];
    const principal =
        !warehouse.usesPersistedVerification && !slot && parent
            ? parent.principal !== null
                ? (testedPrincipal ?? parent.principal)
                : null
            : testedPrincipal;
    const dates = [
        observation?.ok
            ? `Tested ${formatAiServiceAccountDate(observation.checkedAt)}.`
            : null,
        slot ? `Added ${formatAiServiceAccountDate(slot.updatedAt)}.` : null,
    ]
        .filter(Boolean)
        .join(' ');
    return (
        <Stack gap="xs">
            {!slot && parent && parent.credentialsReadable !== false && (
                <Text size="sm">
                    Uses the shared agent account from{' '}
                    {parent.projectName !== null ? (
                        <Anchor
                            component={Link}
                            to={getProjectAgentIdentitySettingsPath(
                                parent.projectUuid,
                            )}
                            size="sm"
                        >
                            {parent.projectName}
                        </Anchor>
                    ) : (
                        'the parent project'
                    )}
                    .
                </Text>
            )}
            {principal ? (
                <Text size="sm" role="status">
                    Signs in as {principal}
                </Text>
            ) : (
                <Text size="sm" c="dimmed">
                    Not tested yet. Select Test to see who it signs in as.
                </Text>
            )}
            <Text size="sm">{warehouse.methodLabel}</Text>
            {dates && (
                <Text size="xs" c="dimmed">
                    {dates}
                </Text>
            )}
        </Stack>
    );
};
