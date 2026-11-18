import {
    AI_THREAD_IMAGES_MAX_PER_PROMPT,
    type AiThreadFile,
    type ApiSuccess,
} from '@lightdash/common';

const uploadOne = async (base64Jpeg: string, index: number) => {
    const image = await (
        await fetch(`data:image/jpeg;base64,${base64Jpeg}`)
    ).blob();
    const filename = `capture-${index + 1}.jpg`;
    const response = await fetch(
        `/api/v1/aiAgents/thread-files/images?filename=${filename}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: image,
        },
    );
    if (!response.ok) throw new Error(`Upload failed: ${response.status}`);
    const json = (await response.json()) as ApiSuccess<AiThreadFile>;
    return json.results.uuid;
};

/**
 * Uploads the marked-up screenshots so they can go to the agent with the
 * prompt. Returns the file ids, or none when images in chat are unavailable.
 */
export const uploadCaptureImages = async (
    base64Jpegs: string[],
): Promise<string[]> => {
    try {
        return await Promise.all(
            base64Jpegs
                .slice(0, AI_THREAD_IMAGES_MAX_PER_PROMPT)
                .map(uploadOne),
        );
    } catch {
        return [];
    }
};
