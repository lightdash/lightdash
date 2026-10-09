import {
    type AiServiceAccountParent,
    type AiServiceAccountSlot,
    type OrganizationAgentIdentityRule,
} from '@lightdash/common';
import { identityWarehouseNames } from './identityLabels';

export type AiServiceAccountStatusInfo = {
    badge: 'In use' | 'Not in use' | null;
    message: string | null;
    alert: { color: 'red' | 'yellow'; message: string } | null;
};

export const getAiServiceAccountStatus = ({
    rule,
    slot,
    parent,
    credentialsReadable,
}: {
    rule: OrganizationAgentIdentityRule & {
        warehouseType: keyof typeof identityWarehouseNames;
    };
    slot: AiServiceAccountSlot | null;
    parent: AiServiceAccountParent | null;
    credentialsReadable: boolean;
}): AiServiceAccountStatusInfo => {
    const required = rule.source === 'ai_service_account';
    const unreadableParent = !slot && parent?.credentialsReadable === false;
    const warehouse = identityWarehouseNames[rule.warehouseType];
    const parentWarning = `Lightdash can't read the parent project's AI service account. Add this preview's own account, or ask an admin of ${parent?.projectName ?? 'the parent project'} to replace it.`;
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
                message:
                    'Agents are refused on this project until you add an AI service account.',
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
                          "The AI service account can't be read. Replace it.",
                  }
                : unreadableParent
                  ? { color: 'red', message: parentWarning }
                  : null,
    };
};
