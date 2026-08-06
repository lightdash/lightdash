import { PartialFailureType, type PartialFailure } from '@lightdash/common';
import { type AttachmentUrl } from '../EmailClient/EmailClient';
import { GoogleChatClient } from './GoogleChatClient';

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
        const fetchMock = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValue({ ok: true, status: 200 } as Response);
        try {
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
            const [, init] = fetchMock.mock.calls[0];
            const payload = JSON.parse(init?.body as string);
            const texts: string[] = payload.cardsV2[0].card.sections[0].widgets
                .map(
                    (widget: { textParagraph?: { text: string } }) =>
                        widget.textParagraph?.text ?? '',
                )
                .filter((text: string) => text.includes('failed to export'));
            expect(texts).toHaveLength(1);
            return texts[0];
        } finally {
            fetchMock.mockRestore();
        }
    };

    const widgetTexts = async (
        args: Parameters<GoogleChatClient['postCsvsWithWebhook']>[0],
    ): Promise<string[]> => {
        const fetchMock = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValue({ ok: true, status: 200 } as Response);
        try {
            await client.postCsvsWithWebhook(args);
            const [, init] = fetchMock.mock.calls[0];
            const payload = JSON.parse(init?.body as string);
            return payload.cardsV2[0].card.sections[0].widgets.map(
                (widget: { textParagraph?: { text: string } }) =>
                    widget.textParagraph?.text ?? '',
            );
        } finally {
            fetchMock.mockRestore();
        }
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

    it('renders identity-changed and all-queries-excluded notices', async () => {
        const texts = await widgetTexts({
            webhookUrl: 'https://chat.googleapis.com/v1/spaces/abc',
            title: 'App delivery',
            name: 'App delivery',
            description: 'desc',
            ctaUrl: 'https://app.lightdash.com/apps/abc',
            csvUrls: [csvUrl],
            footer: 'footer',
            notices: [
                { type: 'query_identity_changed', label: HOSTILE_LABEL },
                { type: 'all_queries_excluded' },
            ],
        });

        const noticeText = texts.find((text) => text.startsWith('ℹ️'));
        expect(noticeText).toContain(
            '- x changed since it was selected; your query selection may not apply to it',
        );
        expect(noticeText).toContain(
            'Every query captured in this delivery was excluded by your query selection, so no files were attached',
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
