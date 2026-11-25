import { type AiPromptContextInput } from '@lightdash/common';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BubbleReplyPoster, { type BubbleReplyPost } from './BubbleReplyPoster';

const mocks = vi.hoisted(() => ({
    imagesEnabled: true,
    api: vi.fn(),
    post: vi.fn(),
    postArgs: [] as unknown[][],
    uploadCaptureImages: vi.fn(),
}));

vi.mock('../../../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: (flag: string) => ({
        data: { enabled: flag === 'ai-thread-images' && mocks.imagesEnabled },
    }),
}));
vi.mock('../../../../../providers/LightdashApi/useLightdashApi', () => ({
    useLightdashApi: () => mocks.api,
}));
vi.mock('../../../dashboardCapture/uploadCaptureImages', () => ({
    uploadCaptureImages: mocks.uploadCaptureImages,
}));
vi.mock('./useBubbleThreadPost', () => ({
    useBubbleThreadPost: (...args: unknown[]) => {
        mocks.postArgs.push(args);
        return { agent: null, post: mocks.post, isPosting: false };
    },
}));

const image = new File(['x'], 'capture-0.jpg', { type: 'image/jpeg' });
const context: AiPromptContextInput = [
    { type: 'dashboard', dashboardUuid: 'dash-1' },
];
const reply = () => ({
    buildPrompt: (hasImages: boolean) =>
        hasImages ? 'with images' : 'text only',
    images: [image],
    context,
});

const mount = (register: (id: string, post: BubbleReplyPost | null) => void) =>
    render(
        <BubbleReplyPoster
            projectUuid="project-1"
            agentUuid="agent-1"
            threadId="thread-1"
            bubbleId="bubble-1"
            register={register}
        />,
    );

const registered = (register: ReturnType<typeof vi.fn>): BubbleReplyPost => {
    const [bubbleId, post] = register.mock.calls[0];
    expect(bubbleId).toBe('bubble-1');
    expect(post).toBeTypeOf('function');
    return post as BubbleReplyPost;
};

describe('BubbleReplyPoster', () => {
    beforeEach(() => {
        mocks.imagesEnabled = true;
        mocks.post.mockReset();
        mocks.post.mockResolvedValue(undefined);
        mocks.postArgs.length = 0;
        mocks.uploadCaptureImages.mockReset();
        mocks.uploadCaptureImages.mockResolvedValue(['file-1']);
    });

    it("registers a way to post to its bubble's conversation", () => {
        const register = vi.fn();
        mount(register);

        expect(register).toHaveBeenCalledTimes(1);
        registered(register);
        expect(mocks.postArgs[0]).toEqual(['project-1', 'agent-1', 'thread-1']);
    });

    it('uploads the marked images and posts them with the reply', async () => {
        const register = vi.fn();
        mount(register);

        await registered(register)(reply());

        expect(mocks.uploadCaptureImages).toHaveBeenCalledWith(mocks.api, [
            image,
        ]);
        expect(mocks.post).toHaveBeenCalledTimes(1);
        expect(mocks.post).toHaveBeenCalledWith({
            prompt: 'with images',
            toolHints: [],
            context: [...context, { type: 'thread_image', fileUuid: 'file-1' }],
            optimisticContext: undefined,
        });
    });

    it('posts text only without ai-thread-images, and uploads nothing', async () => {
        mocks.imagesEnabled = false;
        const register = vi.fn();
        mount(register);

        await registered(register)(reply());

        expect(mocks.uploadCaptureImages).not.toHaveBeenCalled();
        expect(mocks.post).toHaveBeenCalledWith({
            prompt: 'text only',
            toolHints: [],
            context,
            optimisticContext: undefined,
        });
    });

    it('passes on a failed post to the caller', async () => {
        mocks.post.mockRejectedValue(new Error('refused'));
        const register = vi.fn();
        mount(register);

        await expect(registered(register)(reply())).rejects.toThrow('refused');
    });

    it('unregisters when it goes away', () => {
        const register = vi.fn();
        const { unmount } = mount(register);

        unmount();

        expect(register).toHaveBeenLastCalledWith('bubble-1', null);
    });
});
