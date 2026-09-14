import { PartialFailureType, type PartialFailure } from '@lightdash/common';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { postSchedulerWebhook } from '../../utils/schedulerWebhookValidation';
import { type AttachmentUrl } from '../EmailClient/EmailClient';
import {
    MicrosoftTeamsClient,
    redactWebhookIdentity,
} from './MicrosoftTeamsClient';

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
    const client = new MicrosoftTeamsClient({
        lightdashConfig: {
            ...lightdashConfigMock,
            microsoftTeams: { enabled: true },
        },
    });
    const args: Parameters<MicrosoftTeamsClient['postImageWithWebhook']>[0] = {
        webhookUrl: 'https://outlook.office.com/webhook/abc',
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

    it('accepts a 202 response from the secured webhook helper', async () => {
        mockedPostSchedulerWebhook.mockResolvedValueOnce({
            ...successfulWebhookResponse,
            status: 202,
        });

        await client.postImageWithWebhook(args);

        expect(mockedPostSchedulerWebhook).toHaveBeenCalledWith(
            args.webhookUrl,
            expect.objectContaining({ attachments: expect.any(Array) }),
        );
    });

    it('preserves provider errors for non-success responses', async () => {
        mockedPostSchedulerWebhook.mockResolvedValueOnce({
            ...successfulWebhookResponse,
            status: 500,
            bodyText: 'upstream failure',
        });

        await expect(client.postImageWithWebhook(args)).rejects.toThrow(
            'Microsoft teams webhook returned an error',
        );
    });
});

describe('redactWebhookIdentity', () => {
    const teamsWebhookUrl =
        'https://outlook.office.com/webhook/abc123def456-uuid-shape/IncomingWebhook/secrettoken/uuid?key=hunter2';
    const powerAutomateUrl =
        'https://prod-12.region.logic.azure.com:443/workflows/abcdef/triggers/manual/paths/invoke?api-version=2016-06-01&sp=/triggers/manual/run&sv=1.0&sig=longSecretSignature';

    it('redacts a real-shape Teams webhook URL without leaking path or query secrets', () => {
        const result = redactWebhookIdentity(teamsWebhookUrl);

        expect(result.startsWith('outlook.office.com/')).toBe(true);
        expect(result).not.toContain('abc123def456');
        expect(result).not.toContain('secrettoken');
        expect(result).not.toContain('hunter2');
        expect(result).not.toContain('IncomingWebhook');
        expect(result).not.toContain('uuid');
        expect(result).not.toContain('key=');
        expect(result).not.toContain('?');
        expect(result).toMatch(/^outlook\.office\.com\/…[a-f0-9]{12}$/);
    });

    it('redacts a Power Automate Workflows URL without leaking sig token or query secrets', () => {
        const result = redactWebhookIdentity(powerAutomateUrl);

        expect(result.startsWith('prod-12.region.logic.azure.com/')).toBe(true);
        expect(result).not.toContain('longSecretSignature');
        expect(result).not.toContain('sig=');
        expect(result).not.toContain('sp=');
        expect(result).not.toContain('sv=');
        expect(result).not.toContain('api-version');
        expect(result).not.toContain('abcdef');
        expect(result).not.toContain('?');
        expect(result).toMatch(
            /^prod-12\.region\.logic\.azure\.com\/…[a-f0-9]{12}$/,
        );
    });

    it('produces the same hash for the same path (deterministic)', () => {
        const first = redactWebhookIdentity(teamsWebhookUrl);
        const second = redactWebhookIdentity(teamsWebhookUrl);
        expect(first).toBe(second);
    });

    it('produces different hashes for different paths on the same host', () => {
        const urlA =
            'https://outlook.office.com/webhook/path-a/IncomingWebhook/tokenA/uuidA';
        const urlB =
            'https://outlook.office.com/webhook/path-b/IncomingWebhook/tokenB/uuidB';

        const resultA = redactWebhookIdentity(urlA);
        const resultB = redactWebhookIdentity(urlB);

        expect(resultA).not.toBe(resultB);
        expect(resultA.startsWith('outlook.office.com/')).toBe(true);
        expect(resultB.startsWith('outlook.office.com/')).toBe(true);
    });

    it('returns the literal "invalid-url" string for malformed input without throwing', () => {
        expect(() => redactWebhookIdentity('not-a-url')).not.toThrow();
        expect(redactWebhookIdentity('not-a-url')).toBe('invalid-url');
    });
});

describe('postCsvsWithWebhook app failure lines', () => {
    const client = new MicrosoftTeamsClient({
        lightdashConfig: {
            ...lightdashConfigMock,
            microsoftTeams: { enabled: true },
        },
    });
    const csvUrl: AttachmentUrl = {
        filename: 'chart-0.csv',
        path: 'https://s3.example.com/exports/chart-0.csv',
        localPath: '/tmp/chart-0.csv',
        truncated: false,
    };
    // App code authors these, and an Adaptive Card TextBlock renders a markdown
    // subset — a raw label could otherwise inject a link or emphasis.
    const HOSTILE_LABEL = '[x](https://evil) **bold** `code` _em_ ~s~';
    const HOSTILE_ERROR =
        '</b><a href="https://evil">click</a> [y](https://evil)';

    const sendAndCollectText = async (
        failures: PartialFailure[],
        csvUrls: AttachmentUrl[],
    ): Promise<string> => {
        mockedPostSchedulerWebhook.mockResolvedValueOnce(
            successfulWebhookResponse,
        );
        await client.postCsvsWithWebhook({
            webhookUrl: 'https://outlook.office.com/webhook/abc',
            title: 'App delivery',
            name: 'App delivery',
            description: 'desc',
            ctaUrl: 'https://app.lightdash.com/apps/abc',
            csvUrls,
            footer: 'footer',
            failures,
        });
        const [, payload] = mockedPostSchedulerWebhook.mock.calls.at(-1)!;
        return JSON.stringify(payload);
    };

    const expectNoLiveMarkup = (body: string) => {
        const rendered = JSON.parse(body);
        const text = JSON.stringify(rendered);
        // Markdown link syntax and HTML tags must not survive unescaped.
        expect(text).not.toContain('[x](https://evil)');
        expect(text).not.toContain('[y](https://evil)');
        expect(text).not.toContain('<a href');
        expect(text).not.toContain('</b>');
        // The escaped forms are still present, so nothing was silently dropped.
        expect(text).toContain('evil');
    };

    const cardTextBlocks = async (
        args: Parameters<MicrosoftTeamsClient['postCsvsWithWebhook']>[0],
    ): Promise<string[]> => {
        mockedPostSchedulerWebhook.mockResolvedValueOnce(
            successfulWebhookResponse,
        );
        await client.postCsvsWithWebhook(args);
        const [, payload] = mockedPostSchedulerWebhook.mock.calls.at(-1)!;
        return payload.attachments[0].content.body.map(
            (block: { text?: string }) => block.text ?? '',
        );
    };

    // Limit notices reached email and Slack but were silently dropped here.
    it('renders limit-reached notices, escaping the label', async () => {
        const texts = await cardTextBlocks({
            webhookUrl: 'https://outlook.office.com/webhook/abc',
            title: 'App delivery',
            name: 'App delivery',
            description: 'desc',
            ctaUrl: 'https://app.lightdash.com/apps/abc',
            csvUrls: [csvUrl],
            footer: 'footer',
            notices: [
                { type: 'limit_reached', label: 'Sessions', rowCount: 5000 },
            ],
        });

        expect(
            texts.find((text) => text.includes('reached its query limit')),
        ).toBe(
            'ℹ️ Sessions reached its query limit; additional rows may exist (5000 rows delivered)',
        );
    });

    // Notice labels are app-authored like the failure labels, so they must go
    // through the same escaping.
    it('escapes hostile markup in a notice label', async () => {
        const texts = await cardTextBlocks({
            webhookUrl: 'https://outlook.office.com/webhook/abc',
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
        expect(noticeText).toBeDefined();
        expect(noticeText).not.toContain('[x](https://evil)');
        expect(noticeText).not.toContain('<a href');
        // Escaped, not dropped.
        expect(noticeText).toContain('evil');
    });

    it('adds no notice block when the delivery had none', async () => {
        const texts = await cardTextBlocks({
            webhookUrl: 'https://outlook.office.com/webhook/abc',
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
        ['the warning switch', [csvUrl]],
        ['the all-failed switch', [] as AttachmentUrl[]],
    ])('escapes an APP_QUERY label and error in %s', async (_name, csvUrls) => {
        const body = await sendAndCollectText(
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
        expectNoLiveMarkup(body);
    });

    it.each([
        ['the warning switch', [csvUrl]],
        ['the all-failed switch', [] as AttachmentUrl[]],
    ])('escapes an APP_QUERY_MISSING label in %s', async (_name, csvUrls) => {
        const body = await sendAndCollectText(
            [
                {
                    type: PartialFailureType.APP_QUERY_MISSING,
                    captureKey: 'v1:def456',
                    label: HOSTILE_LABEL,
                },
            ],
            csvUrls,
        );
        const text = JSON.stringify(JSON.parse(body));
        expect(text).not.toContain('[x](https://evil)');
        expect(text).toContain('did not run in this delivery');
    });
});
