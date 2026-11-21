import { FeatureFlags } from '@lightdash/common';
import { useEffect, useRef, type FC } from 'react';
import useToaster from '../../../../../hooks/toaster/useToaster';
import { useServerFeatureFlag } from '../../../../../hooks/useServerOrClientFeatureFlag';
import { useLightdashApi } from '../../../../../providers/LightdashApi/useLightdashApi';
import {
    withThreadImages,
    type MarkedMessage,
} from '../../../capture/withThreadImages';
import { useBubbleThreadPost } from './useBubbleThreadPost';

export type BubbleReplyPost = (input: MarkedMessage) => Promise<void>;

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
    const { showToastWarning } = useToaster();
    const imagesFlag = useServerFeatureFlag(FeatureFlags.AiThreadImages);
    const canSendImages = imagesFlag.data?.enabled === true;
    const { post } = useBubbleThreadPost(projectUuid, agentUuid, threadId);

    const replyRef = useRef<BubbleReplyPost | null>(null);
    replyRef.current = async (input) => {
        const { prompt, context, imagesDropped } = await withThreadImages(
            lightdashApi,
            canSendImages,
            input,
        );
        if (imagesDropped) {
            showToastWarning({
                title: 'The screenshot could not be attached',
                subtitle:
                    'The agent got your words without the marked picture.',
            });
        }
        await post({
            prompt,
            toolHints: [],
            context,
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
