import {
    type AiServiceAccountParent,
    type AiServiceAccountSlot,
    type OrganizationAgentIdentityRule,
} from '@lightdash/common';
import { type ReactNode } from 'react';
import i18n from '../../i18n/i18n';
import { identityWarehouseNames } from './identityLabels';

export type AiServiceAccountStatusInfo = {
    badge: 'In use' | 'Not in use' | null;
    message: string | null;
    alert: { color: 'red' | 'yellow'; message: ReactNode } | null;
};

export const getAiServiceAccountStatus = ({
    rule,
    slot,
    parent,
    credentialsReadable,
    isPreview,
}: {
    rule: OrganizationAgentIdentityRule & {
        warehouseType: keyof typeof identityWarehouseNames;
    };
    slot: AiServiceAccountSlot | null;
    parent: AiServiceAccountParent | null;
    credentialsReadable: boolean;
    isPreview: boolean;
}): AiServiceAccountStatusInfo => {
    const required = rule.source === 'ai_service_account';
    const unreadableParent = !slot && parent?.credentialsReadable === false;
    const tr = (key: string, options?: Record<string, unknown>) =>
        i18n.t(`serviceAccountStatus.${key}`, { ns: 'aiAccess', ...options });
    const warehouse = identityWarehouseNames[rule.warehouseType];
    const parentWarning = parent?.projectName
        ? tr('parentWarning', { project: parent.projectName })
        : tr('parentWarningGeneric');
    if (required && unreadableParent)
        return {
            badge: null,
            message: null,
            alert: {
                color: 'red',
                message: tr('refusedPreviewWithWarning', {
                    warning: parentWarning,
                }),
            },
        };
    if (required && !slot && !parent)
        return {
            badge: null,
            message: null,
            alert: {
                color: 'yellow',
                message: isPreview
                    ? tr('refusedPreview')
                    : tr('refusedProject'),
            },
        };
    return {
        badge: required ? 'In use' : 'Not in use',
        message: required
            ? tr('requiredMessage', { warehouse })
            : rule.source === 'agent_sign_in'
              ? tr('agentSignInMessage')
              : tr('personCredentialsMessage', { warehouse }),
        alert:
            slot && !credentialsReadable
                ? {
                      color: 'red',
                      message: tr('unreadable'),
                  }
                : unreadableParent
                  ? { color: 'red', message: parentWarning }
                  : null,
    };
};
