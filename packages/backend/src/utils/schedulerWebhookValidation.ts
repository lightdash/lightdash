import {
    AnyType,
    isCreateSchedulerGoogleChatTarget,
    isCreateSchedulerMsTeamsTarget,
    type SchedulerEmailTarget,
    type SchedulerGoogleChatTarget,
    type SchedulerMsTeamsTarget,
    type SchedulerSlackTarget,
} from '@lightdash/common';
import { secureFetch } from './secureFetch/secureFetch';
import { validatePublicHttpUrl } from './ssrfProtection';

type SchedulerTarget =
    | Pick<SchedulerSlackTarget, 'channel'>
    | Pick<SchedulerEmailTarget, 'recipient'>
    | Pick<SchedulerMsTeamsTarget, 'webhook'>
    | Pick<SchedulerGoogleChatTarget, 'googleChatWebhook'>;

export const validateSchedulerWebhookTargets = async (
    targets: SchedulerTarget[],
): Promise<void> => {
    await Promise.all(
        targets.map(async (target) => {
            if (isCreateSchedulerMsTeamsTarget(target)) {
                await validatePublicHttpUrl(target.webhook, {
                    context: 'webhook',
                });
            }
            if (isCreateSchedulerGoogleChatTarget(target)) {
                await validatePublicHttpUrl(target.googleChatWebhook, {
                    context: 'webhook',
                });
            }
        }),
    );
};

export const postSchedulerWebhook = async (
    webhookUrl: string,
    payload: AnyType,
    contentType = 'application/json',
) =>
    secureFetch(webhookUrl, {
        method: 'POST',
        headers: {
            'Content-Type': contentType,
        },
        body: JSON.stringify(payload),
        timeoutMs: 30_000,
        maxResponseBytes: 64 * 1024,
        allowedContentTypes: [],
    });
