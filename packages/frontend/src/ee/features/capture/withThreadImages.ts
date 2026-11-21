import { type AiPromptContextInput } from '@lightdash/common';
import { type LightdashApi } from '../../../api';
import { uploadCaptureImages } from '../dashboardCapture/uploadCaptureImages';

export type MarkedMessage = {
    /** The message, worded for whether the marked images go with it. */
    buildPrompt: (hasImages: boolean) => string;
    images: File[];
    context: AiPromptContextInput;
};

/**
 * Turns a marked message into what the agent is sent. Images upload here and
 * join the context; without `ai-thread-images` the agent gets text only.
 */
export const withThreadImages = async (
    lightdashApi: LightdashApi,
    canSendImages: boolean,
    { buildPrompt, images, context }: MarkedMessage,
): Promise<{
    prompt: string;
    context: AiPromptContextInput;
    /** The images were meant to go with the message but could not upload. */
    imagesDropped: boolean;
}> => {
    const fileUuids =
        canSendImages && images.length > 0
            ? await uploadCaptureImages(lightdashApi, images)
            : [];
    return {
        imagesDropped:
            canSendImages && images.length > 0 && fileUuids.length === 0,
        prompt: buildPrompt(fileUuids.length > 0),
        context: [
            ...context,
            ...fileUuids.map((fileUuid) => ({
                type: 'thread_image' as const,
                fileUuid,
            })),
        ],
    };
};
