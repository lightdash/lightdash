import {
    AI_THREAD_IMAGES_MAX_PER_PROMPT,
    type AiThreadFile,
} from '@lightdash/common';
import { type LightdashApi } from '../../../api';

/**
 * Uploads the marked screenshots of a recording as conversation images, so
 * the agent sees the marks the way they were drawn. Returns their file ids,
 * or none when images cannot be uploaded; the agent then gets text only.
 */
export const uploadCaptureImages = async (
    lightdashApi: LightdashApi,
    images: File[],
): Promise<string[]> => {
    try {
        const uploaded = await Promise.all(
            images.slice(0, AI_THREAD_IMAGES_MAX_PER_PROMPT).map((image) =>
                lightdashApi<AiThreadFile>({
                    url: `/aiAgents/thread-files/images?${new URLSearchParams({
                        filename: image.name,
                    }).toString()}`,
                    method: 'POST',
                    body: image,
                    sensitive: true,
                    headers: { 'Content-Type': 'application/octet-stream' },
                }),
            ),
        );
        return uploaded.map((file) => file.uuid);
    } catch {
        return [];
    }
};
