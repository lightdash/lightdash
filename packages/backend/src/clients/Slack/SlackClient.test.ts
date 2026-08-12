import { type WebClient } from '@slack/web-api';
import { SlackClient } from './SlackClient';

const invalidBlocksError = (messages: string[]) => ({
    data: {
        error: 'invalid_blocks',
        response_metadata: { messages },
    },
});

const blocks = [
    { type: 'header', text: { type: 'plain_text', text: 'Chart' } },
    { type: 'section', text: { type: 'mrkdwn', text: 'Description' } },
    {
        type: 'image',
        image_url: 'https://internal.example.com/img.png',
        alt_text: 'Chart',
    },
];

describe('SlackClient.postMessage invalid_blocks retry', () => {
    const postMessageMock = vi.fn();
    let client: SlackClient;

    beforeEach(() => {
        postMessageMock.mockReset();
        client = new SlackClient({
            slackAuthenticationModel: {
                getInstallationFromOrganizationUuid: vi
                    .fn()
                    .mockResolvedValue({ appProfilePhotoUrl: undefined }),
            },
            slackChannelCacheModel: {},
            lightdashConfig: { slack: {} },
            analytics: {},
            schedulerClient: {},
        } as unknown as ConstructorParameters<typeof SlackClient>[0]);
        vi.spyOn(client, 'getWebClient').mockResolvedValue({
            chat: { postMessage: postMessageMock },
        } as unknown as WebClient);
        vi.spyOn(client, 'resolveChannelToId').mockResolvedValue('C123');
    });

    it('retries once with a notice when Slack only rejected image blocks', async () => {
        postMessageMock
            .mockRejectedValueOnce(
                invalidBlocksError([
                    '[ERROR] downloading image failed [json-pointer:/blocks/2/image_url]',
                ]),
            )
            .mockResolvedValueOnce({ ok: true, ts: '1.2' });

        const result = await client.postMessage({
            organizationUuid: 'org-uuid',
            channel: 'C123',
            text: 'Alert',
            blocks,
        });

        expect(result).toEqual({ ok: true, ts: '1.2' });
        expect(postMessageMock).toHaveBeenCalledTimes(2);
        const retryBlocks = postMessageMock.mock.calls[1][0].blocks;
        expect(retryBlocks).toHaveLength(blocks.length);
        expect(retryBlocks[0]).toEqual(blocks[0]);
        expect(retryBlocks[1]).toEqual(blocks[1]);
        expect(retryBlocks[2].type).toBe('section');
        expect(retryBlocks[2].text.text).toMatch(/preview unavailable/i);
    });

    it('does not retry when Slack rejected a non-image block', async () => {
        const error = invalidBlocksError([
            '[ERROR] failed to match all allowed schemas [json-pointer:/blocks/1]',
        ]);
        postMessageMock.mockRejectedValueOnce(error);

        await expect(
            client.postMessage({
                organizationUuid: 'org-uuid',
                channel: 'C123',
                text: 'Alert',
                blocks,
            }),
        ).rejects.toBe(error);
        expect(postMessageMock).toHaveBeenCalledTimes(1);
    });

    it('does not retry when both image and non-image blocks were rejected', async () => {
        const error = invalidBlocksError([
            '[ERROR] downloading image failed [json-pointer:/blocks/2/image_url]',
            '[ERROR] failed to match all allowed schemas [json-pointer:/blocks/1]',
        ]);
        postMessageMock.mockRejectedValueOnce(error);

        await expect(
            client.postMessage({
                organizationUuid: 'org-uuid',
                channel: 'C123',
                text: 'Alert',
                blocks,
            }),
        ).rejects.toBe(error);
        expect(postMessageMock).toHaveBeenCalledTimes(1);
    });

    it('rethrows when the retry also fails', async () => {
        const firstError = invalidBlocksError([
            '[ERROR] downloading image failed [json-pointer:/blocks/2/image_url]',
        ]);
        const retryError = new Error('channel_not_found');
        postMessageMock
            .mockRejectedValueOnce(firstError)
            .mockRejectedValueOnce(retryError);

        await expect(
            client.postMessage({
                organizationUuid: 'org-uuid',
                channel: 'C123',
                text: 'Alert',
                blocks,
            }),
        ).rejects.toBe(retryError);
        expect(postMessageMock).toHaveBeenCalledTimes(2);
    });
});

describe('SlackClient.fetchAllChannelsForCache', () => {
    it('does not spend more than twenty seconds pacing a two-page workspace sync', async () => {
        vi.useFakeTimers();
        try {
            const client = new SlackClient({
                slackAuthenticationModel: {},
                slackChannelCacheModel: {},
                lightdashConfig: { slack: {} },
                analytics: {},
                schedulerClient: {},
            } as unknown as ConstructorParameters<typeof SlackClient>[0]);
            const conversationsListMock = vi
                .fn()
                .mockResolvedValueOnce({
                    channels: [{ id: 'C1', name: 'first' }],
                    response_metadata: { next_cursor: 'next-page' },
                })
                .mockResolvedValueOnce({
                    channels: [{ id: 'C2', name: 'second' }],
                    response_metadata: { next_cursor: '' },
                });
            const usersListMock = vi.fn().mockResolvedValue({
                members: [],
                response_metadata: { next_cursor: '' },
            });

            vi.spyOn(client, 'getWebClient').mockResolvedValue({
                conversations: { list: conversationsListMock },
                users: { list: usersListMock },
            } as unknown as WebClient);

            const resultPromise = client.fetchAllChannelsForCache('org-uuid');
            const result = resultPromise.then(() => true);

            await vi.advanceTimersByTimeAsync(20_001);

            await expect(result).resolves.toBe(true);
            await expect(resultPromise).resolves.toHaveLength(2);
        } finally {
            vi.useRealTimers();
        }
    });
});
