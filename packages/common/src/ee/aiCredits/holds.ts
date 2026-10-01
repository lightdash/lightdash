import { ForbiddenError } from '../../types/errors';
import assertUnreachable from '../../utils/assertUnreachable';
import {
    DEFAULT_UI_STRINGS,
    type UiStringResolver,
} from '../../utils/i18n/uiStrings';
import { type AiCreditAllowanceMode, type AiCreditHoldReason } from './types';

/**
 * Only the allowance hold depends on the contract: a warn-only contract keeps AI
 * available past its allowance. Every other hold was placed on purpose and always pauses AI.
 */
export const isAiCreditHoldBlocking = (
    reason: AiCreditHoldReason,
    allowanceMode: AiCreditAllowanceMode | null,
): boolean => reason !== 'allowance_exhausted' || allowanceMode === 'enforce';

export type AiCreditsPausedAudience = 'admin' | 'member' | 'embedViewer';

const getHoldReasonMessage = (reason: AiCreditHoldReason): string => {
    switch (reason) {
        case 'allowance_exhausted':
            return "This period's AI credit allowance is used up.";
        case 'admin_cap_reached':
            return "Your organization's AI usage cap has been reached.";
        case 'manual_pause':
            return 'AI usage is paused for your organization.';
        case 'trial_ended':
            return 'Your AI trial has ended.';
        default:
            return assertUnreachable(
                reason,
                `Unknown AI credit hold reason ${reason}`,
            );
    }
};

const resolveDefaultUiString: UiStringResolver = (key) =>
    DEFAULT_UI_STRINGS[key];

export const getAiCreditsPausedMessage = ({
    reason,
    audience,
    settingsUrl,
    resolveUiString = resolveDefaultUiString,
}: {
    reason: AiCreditHoldReason;
    audience: AiCreditsPausedAudience;
    // Only for admins who can open the AI credits settings page.
    settingsUrl: string | null;
    resolveUiString?: UiStringResolver;
}): string => {
    switch (audience) {
        case 'admin':
            return settingsUrl === null
                ? getHoldReasonMessage(reason)
                : `${getHoldReasonMessage(reason)} See AI credits settings: ${settingsUrl}`;
        case 'member':
            return `${getHoldReasonMessage(reason)} Contact an organization admin.`;
        case 'embedViewer':
            return resolveUiString('aiAgent.unavailable');
        default:
            return assertUnreachable(
                audience,
                `Unknown AI credits paused audience ${audience}`,
            );
    }
};

export class AiCreditsPausedError extends ForbiddenError {
    readonly reason: AiCreditHoldReason;

    constructor({
        reason,
        message,
    }: {
        reason: AiCreditHoldReason;
        message: string;
    }) {
        super(message, { reason });
        this.name = 'AiCreditsPausedError';
        this.reason = reason;
    }
}
