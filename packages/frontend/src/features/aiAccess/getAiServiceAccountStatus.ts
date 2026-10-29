import {
    assertUnreachable,
    type AiServiceAccountParent,
    type AiServiceAccountParentUnavailableReason,
    type AiServiceAccountSlot,
    type OrganizationAgentIdentityRule,
} from '@lightdash/common';
import { type ReactNode } from 'react';
import { identityWarehouseNames } from './identityLabels';

export type AiServiceAccountStatusInfo = {
    badge: 'In use' | 'Not in use' | null;
    message: string | null;
    alert: { color: 'red' | 'yellow'; message: ReactNode } | null;
};

const getParentUnavailableMessage = (
    reason: AiServiceAccountParentUnavailableReason,
): string => {
    switch (reason) {
        case 'destination_mismatch':
            return "This preview's warehouse destination differs from its parent project, so it can't use the parent's shared agent account. Match the destination settings, including the port and SSH tunnel, to inherit it.";
        case 'transport_mismatch':
            return "This preview's TLS settings differ from its parent project, so it can't use the parent's shared agent account. Match the TLS mode and CA certificate to inherit it.";
        case 'parent_connection_unreadable':
            return "This preview can't read the parent project's warehouse connection to check whether it can use the parent's shared agent account. Ask an admin to repair the parent connection.";
        default:
            return assertUnreachable(
                reason,
                'Unknown parent account unavailability reason',
            );
    }
};

export const getAiServiceAccountStatus = ({
    rule,
    slot,
    parent,
    parentUnavailableReason,
    credentialsReadable,
    isPreview,
}: {
    rule: OrganizationAgentIdentityRule & {
        warehouseType: keyof typeof identityWarehouseNames;
    };
    slot: AiServiceAccountSlot | null;
    parent: AiServiceAccountParent | null;
    parentUnavailableReason: AiServiceAccountParentUnavailableReason | null;
    credentialsReadable: boolean;
    isPreview: boolean;
}): AiServiceAccountStatusInfo => {
    const required = rule.source === 'ai_service_account';
    if (parentUnavailableReason !== null)
        return {
            badge: null,
            message: null,
            alert: {
                color: required ? 'red' : 'yellow',
                message: getParentUnavailableMessage(parentUnavailableReason),
            },
        };
    const unreadableParent = !slot && parent?.credentialsReadable === false;
    const warehouse = identityWarehouseNames[rule.warehouseType];
    const parentWarning = `This preview can't read the parent project's shared agent account. Ask an admin of ${parent?.projectName ?? 'the parent project'} to replace it.`;
    if (required && unreadableParent)
        return {
            badge: null,
            message: null,
            alert: {
                color: 'red',
                message: `Agents are refused on this preview. ${parentWarning}`,
            },
        };
    if (required && !slot && !parent)
        return {
            badge: null,
            message: null,
            alert: {
                color: 'yellow',
                message: isPreview
                    ? 'Agents are refused on this preview until the parent project has a shared agent account for this connection.'
                    : 'Agents are refused on this project until you add a shared agent account.',
            },
        };
    return {
        badge: required ? 'In use' : 'Not in use',
        message: required
            ? `Agents on this project run as this account. The organization rule for ${warehouse} requires it.`
            : rule.source === 'agent_sign_in'
              ? "Agents on this project use each person's own agent sign-in for Snowflake. The organization rule decides this."
              : `Agents on this project use each person's own ${warehouse} credentials. The organization rule decides this.`,
        alert:
            slot && !credentialsReadable
                ? {
                      color: 'red',
                      message:
                          "The shared agent account can't be read. Replace it.",
                  }
                : unreadableParent
                  ? { color: 'red', message: parentWarning }
                  : null,
    };
};
