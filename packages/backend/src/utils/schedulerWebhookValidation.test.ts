import { lookup } from 'node:dns/promises';
import {
    postSchedulerWebhook,
    validateSchedulerWebhookTargets,
} from './schedulerWebhookValidation';
import { secureFetch } from './secureFetch/secureFetch';

vi.mock('node:dns/promises', () => ({
    lookup: vi.fn(),
}));

vi.mock('./secureFetch/secureFetch', () => ({
    secureFetch: vi.fn(),
}));

const mockedLookup = lookup as unknown as import('vitest').MockedFunction<
    () => Promise<{ address: string; family: number }[]>
>;
const mockedSecureFetch = vi.mocked(secureFetch);

describe('validateSchedulerWebhookTargets', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockedLookup.mockResolvedValue([
            { address: '93.184.216.34', family: 4 },
        ]);
    });

    it.each([
        { webhook: 'https://outlook.office.com/webhook/abc' },
        {
            googleChatWebhook:
                'https://chat.googleapis.com/v1/spaces/abc/messages',
        },
    ])('accepts a public HTTPS webhook target', async (target) => {
        await expect(
            validateSchedulerWebhookTargets([target]),
        ).resolves.toBeUndefined();
    });

    it('ignores non-webhook targets', async () => {
        await validateSchedulerWebhookTargets([
            { recipient: 'recipient@example.com' },
            { channel: 'C123' },
        ]);

        expect(mockedLookup).not.toHaveBeenCalled();
    });

    it.each([
        ['malformed URL', 'not-a-url', 'Enter a valid webhook URL'],
        ['HTTP URL', 'http://example.com', 'must start with https://'],
        [
            'embedded credentials',
            'https://user:pass@example.com',
            'Remove the username or password',
        ],
        ['localhost', 'https://localhost/hook', 'must use a public URL'],
        ['loopback address', 'https://127.0.0.1/hook', 'must use a public URL'],
        [
            'link-local address',
            'https://169.254.169.254/latest/meta-data',
            'must use a public URL',
        ],
    ])('rejects a %s', async (_label, url, expectedMessage) => {
        await expect(
            validateSchedulerWebhookTargets([{ webhook: url }]),
        ).rejects.toThrow(expectedMessage);
    });

    it.each([
        [[{ address: '10.0.0.2', family: 4 }]],
        [
            [
                { address: '93.184.216.34', family: 4 },
                { address: '192.168.1.2', family: 4 },
            ],
        ],
    ])('rejects a hostname with private DNS results', async (addresses) => {
        mockedLookup.mockResolvedValueOnce(addresses);

        await expect(
            validateSchedulerWebhookTargets([
                { googleChatWebhook: 'https://webhook.example.com/hook' },
            ]),
        ).rejects.toThrow('must use a public URL');
    });

    it('rejects an unresolved hostname', async () => {
        mockedLookup.mockRejectedValueOnce(new Error('ENOTFOUND'));

        await expect(
            validateSchedulerWebhookTargets([
                { webhook: 'https://missing.example.com/hook' },
            ]),
        ).rejects.toThrow("We couldn't find a server at that webhook URL");
    });

    it('fails closed when DNS returns no addresses', async () => {
        mockedLookup.mockResolvedValueOnce([]);

        await expect(
            validateSchedulerWebhookTargets([
                { webhook: 'https://empty.example.com/hook' },
            ]),
        ).rejects.toThrow('must use a public URL');
    });
});

describe('postSchedulerWebhook', () => {
    it('uses the pinned secure fetch path with bounded webhook options', async () => {
        mockedSecureFetch.mockResolvedValueOnce({
            status: 202,
            contentType: '',
            headers: {},
            bodyText: '',
            truncated: false,
        });
        const payload = { text: 'hello' };

        await expect(
            postSchedulerWebhook(
                'https://webhook.example.com/hook',
                payload,
                'application/json; charset=UTF-8',
            ),
        ).resolves.toMatchObject({ status: 202 });

        expect(mockedSecureFetch).toHaveBeenCalledWith(
            'https://webhook.example.com/hook',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json; charset=UTF-8',
                },
                body: JSON.stringify(payload),
                timeoutMs: 30_000,
                maxResponseBytes: 64 * 1024,
                allowedContentTypes: [],
            },
        );
    });
});
