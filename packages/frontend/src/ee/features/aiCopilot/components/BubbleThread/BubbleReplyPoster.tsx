import { FeatureFlags, type AiPromptContextInput } from '@lightdash/common';
import { useEffect, useRef, type FC } from 'react';
import { useServerFeatureFlag } from '../../../../../hooks/useServerOrClientFeatureFlag';
import { useLightdashApi } from '../../../../../providers/LightdashApi/useLightdashApi';
import { uploadCaptureImages } from '../../../dashboardCapture/uploadCaptureImages';
import { useBubbleThreadPost } from './useBubbleThreadPost';

export type BubbleReplyPost = (input: {
    /** The message, worded for whether the marked images go with it. */
    buildPrompt: (hasImages: boolean) => string;
    images: File[];
    context: AiPromptContextInput;
}) => Promise<void>;

type Props = {
    projectUuid: string;
    agentUuid: string;
    threadId: string;
    bubbleId: string;
    /** Hands the page this bubble's way to post a reply; null when it goes away. */
    register: (bubbleId: string, post: BubbleReplyPost | null) => void;
};

/**
 * Draws nothing. Lets the page send a reply with marked images to a bubble's
 * conversation, also while the bubble shows "Sending" in place of its thread.
 */
const BubbleReplyPoster: FC<Props> = ({
    projectUuid,
    agentUuid,
    threadId,
    bubbleId,
    register,
}) => {
    const lightdashApi = useLightdashApi();
    const imagesFlag = useServerFeatureFlag(FeatureFlags.AiThreadImages);
    const canSendImages = imagesFlag.data?.enabled === true;
    const { post } = useBubbleThreadPost(projectUuid, agentUuid, threadId);

    const replyRef = useRef<BubbleReplyPost | null>(null);
    replyRef.current = async ({ buildPrompt, images, context }) => {
        const fileUuids =
            canSendImages && images.length > 0
                ? await uploadCaptureImages(lightdashApi, images)
                : [];
        await post({
            prompt: buildPrompt(fileUuids.length > 0),
            toolHints: [],
            context: [
                ...context,
                ...fileUuids.map((fileUuid) => ({
                    type: 'thread_image' as const,
                    fileUuid,
                })),
            ],
            optimisticContext: undefined,
        });
    };

    useEffect(() => {
        register(bubbleId, (input) =>
            replyRef.current
                ? replyRef.current(input)
                : Promise.reject(new Error('The conversation is closed')),
        );
        return () => register(bubbleId, null);
    }, [bubbleId, register]);

    return null;
};

export default BubbleReplyPoster;
