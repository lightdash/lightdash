import { type Block, type KnownBlock } from '@slack/web-api';
import { type SlackArtifactRenderInput } from '../../database/entities/aiSlackArtifactDeliveries';
import {
    SLACK_ARTIFACT_DELIVERY_MAX_ATTEMPTS,
    type AiSlackArtifactDeliveryModel,
} from '../../models/AiSlackArtifactDeliveryModel';
import {
    applySlackArtifactImages,
    getSlackArtifactCardVersions,
} from '../ai/utils/slackArtifactImages';

export type SlackArtifactDeliveryMessage = {
    ts: string;
    text: string;
    blocks: (Block | KnownBlock)[];
};

export type SlackArtifactDeliveryRuntime = {
    findMessage: (
        messageTs: string | null,
        versions: string[],
    ) => Promise<SlackArtifactDeliveryMessage | null>;
    authorize: (input: SlackArtifactRenderInput) => Promise<void>;
    render: (input: SlackArtifactRenderInput) => Promise<string | null>;
    isImageReachable: (url: string) => Promise<boolean>;
    updateMessage: (message: SlackArtifactDeliveryMessage) => Promise<void>;
};

/** Runs only after the answer is available. The scheduler serializes by prompt;
 * retries read persisted images and patch the current message rather than post. */
export const deliverSlackArtifactImages = async ({
    promptUuid,
    model,
    prepare,
    signal,
}: {
    promptUuid: string;
    model: Pick<
        AiSlackArtifactDeliveryModel,
        'claim' | 'get' | 'setMessage' | 'saveImage' | 'finish'
    >;
    prepare: () => Promise<SlackArtifactDeliveryRuntime | null>;
    signal?: AbortSignal;
}): Promise<void> => {
    const delivery = await model.claim(promptUuid);
    if (!delivery) return;
    try {
        const runtime = await prepare();
        if (!runtime) {
            await model.finish(promptUuid, 'cancelled', delivery.attempts);
            return;
        }
        const message = await runtime.findMessage(
            delivery.message_ts,
            Object.keys(delivery.render_inputs),
        );
        if (!message)
            throw new Error('Slack artifact cards are not available yet');
        await model.setMessage(promptUuid, message.ts);
        const versions = [
            ...new Set(getSlackArtifactCardVersions(message.blocks)),
        ]
            .filter((version) => Object.hasOwn(delivery.render_inputs, version))
            .slice(0, 10);
        if (versions.length === 0) {
            await model.finish(promptUuid, 'cancelled', delivery.attempts);
            return;
        }
        let retryNeeded = false;
        let unavailable = false;
        for (const version of versions) {
            signal?.throwIfAborted();
            const input = delivery.render_inputs[version];
            // Authorization also applies to images persisted by an older job.
            // eslint-disable-next-line no-await-in-loop
            await runtime.authorize(input);
            if (!delivery.rendered_images[version]) {
                try {
                    // eslint-disable-next-line no-await-in-loop
                    const url = await runtime.render(input);
                    if (url) {
                        // eslint-disable-next-line no-await-in-loop
                        await model.saveImage(promptUuid, version, url);
                    } else unavailable = true;
                } catch {
                    // Persisted successes can be delivered even when another chart
                    // is temporarily unavailable; only failed renders repeat.
                    retryNeeded = true;
                }
            }
        }

        // Refresh policy and the actual message after rendering: settings,
        // feedback and message edits may have changed during image generation.
        const currentRuntime = await prepare();
        signal?.throwIfAborted();
        if (!currentRuntime) {
            await model.finish(promptUuid, 'cancelled', delivery.attempts);
            return;
        }
        const current = await model.get(promptUuid);
        if (
            !current ||
            current.finished_at ||
            current.attempts !== delivery.attempts
        )
            return;
        const latestMessage = await currentRuntime.findMessage(
            message.ts,
            versions,
        );
        if (!latestMessage)
            throw new Error('Slack artifact message is unavailable');
        const images: Record<string, { url: string; reachable: boolean }> = {};
        for (const version of versions) {
            const url = current.rendered_images[version];
            if (url) {
                // eslint-disable-next-line no-await-in-loop
                await currentRuntime.authorize(delivery.render_inputs[version]);
                images[version] = {
                    url,
                    // eslint-disable-next-line no-await-in-loop
                    reachable: await currentRuntime.isImageReachable(url),
                };
            }
        }
        const updated = applySlackArtifactImages(latestMessage.blocks, images);
        // The scheduler timeout does not abort an in-flight renderer or Slack
        // read. Recheck after those awaits before publishing a stale attempt.
        const beforePublish = await model.get(promptUuid);
        signal?.throwIfAborted();
        if (
            !beforePublish ||
            beforePublish.finished_at ||
            beforePublish.attempts !== delivery.attempts
        )
            return;
        if (updated.changed)
            await currentRuntime.updateMessage({
                ...latestMessage,
                blocks: updated.blocks,
            });
        if (retryNeeded)
            throw new Error('Some Slack artifact images are still unavailable');
        await model.finish(
            promptUuid,
            unavailable ? 'unavailable' : 'delivered',
            delivery.attempts,
        );
    } catch (error) {
        if (delivery.attempts >= SLACK_ARTIFACT_DELIVERY_MAX_ATTEMPTS)
            await model.finish(promptUuid, 'unavailable', delivery.attempts);
        throw error;
    }
};
