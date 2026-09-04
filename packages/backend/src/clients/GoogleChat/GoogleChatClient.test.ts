import { PartialFailureType, type PartialFailure } from '@lightdash/common';
import { postSchedulerWebhook } from '../../utils/schedulerWebhookValidation';
import { type AttachmentUrl } from '../EmailClient/EmailClient';
import { GoogleChatClient } from './GoogleChatClient';

vi.mock('../../utils/schedulerWebhookValidation', () => ({
    postSchedulerWebhook: vi.fn(),
}));

const mockedPostSchedulerWebhook = vi.mocked(postSchedulerWebhook);
const successfulWebhookResponse = {
    status: 200,
    contentType: '',
    headers: {},
    bodyText: '',
    truncated: false,
};

describe('webhook delivery', () => {
    const client = new GoogleChatClient();
    const args: Parameters<GoogleChatClient['postImageWithWebhook']>[0] = {
        webhookUrl: 'https://chat.googleapis.com/v1/spaces/abc/messages',
        title: 'Delivery',
        name: 'Chart',
        description: undefined,
        ctaUrl: 'https://app.lightdash.com/chart',
        image: 'https://app.lightdash.com/image.png',
        footer: 'Footer',
    };

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('posts through the secured webhook helper', async () => {
        mockedPostSchedulerWebhook.mockResolvedValueOnce({
            ...successfulWebhookResponse,
            status: 204,
        });

        await client.postImageWithWebhook(args);

        expect(mockedPostSchedulerWebhook).toHaveBeenCalledWith(
            args.webhookUrl,
            expect.objectContaining({ cardsV2: expect.any(Array) }),
            'application/json; charset=UTF-8',
        );
    });

    it('preserves provider errors for non-success responses', async () => {
        mockedPostSchedulerWebhook.mockResolvedValueOnce({
            ...successfulWebhookResponse,
            status: 500,
            bodyText: 'upstream failure',
        });

        await expect(client.postImageWithWebhook(args)).rejects.toThrow(
            'Google Chat webhook returned an error',
        );
    });
});

describe('postCsvsWithWebhook app failure lines', () => {
    const client = new GoogleChatClient();
    const csvUrl: AttachmentUrl = {
        filename: 'chart-0.csv',
        path: 'https://s3.example.com/exports/chart-0.csv',
        localPath: '/tmp/chart-0.csv',
        truncated: false,
    };
    // App code authors these, and Google Chat interprets a subset of HTML in
    // textParagraph.text — a raw label could otherwise inject a live link.
    const HOSTILE_LABEL = '</b><a href="https://evil">x</a>';
    const HOSTILE_ERROR = '<b>boom</b><img src="https://evil/pixel">';

    /** Sends the card and returns the text of the failure widget only — the
     *  download-links widget legitimately contains anchors. */
    const failureWidgetText = async (
        failures: PartialFailure[],
        csvUrls: AttachmentUrl[],
    ): Promise<string> => {
        mockedPostSchedulerWebhook.mockResolvedValueOnce(
            successfulWebhookResponse,
        );
        await client.postCsvsWithWebhook({
            webhookUrl: 'https://chat.googleapis.com/v1/spaces/abc',
            title: 'App delivery',
            name: 'App delivery',
            description: 'desc',
            ctaUrl: 'https://app.lightdash.com/apps/abc',
            csvUrls,
            footer: 'footer',
            failures,
        });
        const [, payload] = mockedPostSchedulerWebhook.mock.calls.at(-1)!;
        const texts: string[] = payload.cardsV2[0].card.sections[0].widgets
            .map(
                (widget: { textParagraph?: { text: string } }) =>
                    widget.textParagraph?.text ?? '',
            )
            .filter((text: string) => text.includes('failed to export'));
        expect(texts).toHaveLength(1);
        return texts[0];
    };

    const widgetTexts = async (
        args: Parameters<GoogleChatClient['postCsvsWithWebhook']>[0],
    ): Promise<string[]> => {
        mockedPostSchedulerWebhook.mockResolvedValueOnce(
            successfulWebhookResponse,
        );
        await client.postCsvsWithWebhook(args);
        const [, payload] = mockedPostSchedulerWebhook.mock.calls.at(-1)!;
        return payload.cardsV2[0].card.sections[0].widgets.map(
            (widget: { textParagraph?: { text: string } }) =>
                widget.textParagraph?.text ?? '',
        );
    };

    // Limit notices reached email and Slack but were silently dropped here.
    it('renders limit-reached notices, stripping markup from the label', async () => {
        const texts = await widgetTexts({
            webhookUrl: 'https://chat.googleapis.com/v1/spaces/abc',
            title: 'App delivery',
            name: 'App delivery',
            description: 'desc',
            ctaUrl: 'https://app.lightdash.com/apps/abc',
            csvUrls: [csvUrl],
            footer: 'footer',
            notices: [
                {
                    type: 'limit_reached',
                    label: HOSTILE_LABEL,
                    rowCount: 5000,
                },
            ],
        });

        const noticeText = texts.find((text) =>
            text.includes('reached its query limit'),
        );
        expect(noticeText).toBe(
            'ℹ️ - x reached its query limit; additional rows may exist (5000 rows delivered)',
        );
        expect(noticeText).not.toContain('<a href');
    });

    it('adds no notice widget when the delivery had none', async () => {
        const texts = await widgetTexts({
            webhookUrl: 'https://chat.googleapis.com/v1/spaces/abc',
            title: 'App delivery',
            name: 'App delivery',
            description: 'desc',
            ctaUrl: 'https://app.lightdash.com/apps/abc',
            csvUrls: [csvUrl],
            footer: 'footer',
        });

        expect(
            texts.some((text) => text.includes('reached its query limit')),
        ).toBe(false);
    });

    it.each([
        ['the warning branch', [csvUrl]],
        ['the all-failed branch', [] as AttachmentUrl[]],
    ])(
        'strips HTML from an APP_QUERY label and error in %s',
        async (_name, csvUrls) => {
            const text = await failureWidgetText(
                [
                    {
                        type: PartialFailureType.APP_QUERY,
                        stage: 'render',
                        captureKey: 'v1:abc123',
                        label: HOSTILE_LABEL,
                        error: HOSTILE_ERROR,
                    },
                ],
                csvUrls,
            );

            expect(text).not.toContain('<a href');
            expect(text).not.toContain('<img');
            // Only the static <b> wrapper the template adds survives.
            expect(text).toContain('- <b>x:</b> boom');
        },
    );

    it.each([
        ['the warning branch', [csvUrl]],
        ['the all-failed branch', [] as AttachmentUrl[]],
    ])(
        'strips HTML from an APP_QUERY_MISSING label in %s',
        async (_name, csvUrls) => {
            const text = await failureWidgetText(
                [
                    {
                        type: PartialFailureType.APP_QUERY_MISSING,
                        captureKey: 'v1:def456',
                        label: HOSTILE_LABEL,
                    },
                ],
                csvUrls,
            );

            expect(text).not.toContain('<a href');
            expect(text).toContain('- <b>x:</b> did not run in this delivery');
        },
    );
});
