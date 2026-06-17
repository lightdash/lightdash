import dns from 'dns/promises';
import fetch, { FetchError, Response } from 'node-fetch';
import { secureFetch, SecureFetchError } from './secureFetch';

jest.mock('dns/promises', () => ({
    __esModule: true,
    default: { lookup: jest.fn() },
}));
jest.mock('node-fetch', () => {
    const actual = jest.requireActual('node-fetch');
    const mockFetch = jest.fn();
    return {
        __esModule: true,
        default: mockFetch,
        FetchError: actual.FetchError,
        Response: actual.Response,
    };
});

const mockedLookup = dns.lookup as unknown as jest.Mock;
const mockedFetch = fetch as unknown as jest.Mock;

const BASE_OPTIONS = {
    method: 'GET' as const,
    timeoutMs: 5000,
    maxResponseBytes: 1024 * 1024,
    allowedContentTypes: ['application/json'],
};

beforeEach(() => {
    jest.clearAllMocks();
    mockedLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
});

const expectReason = async (
    promise: Promise<unknown>,
    reason: string,
): Promise<void> => {
    await expect(promise).rejects.toBeInstanceOf(SecureFetchError);
    await expect(promise).rejects.toMatchObject({ reason });
};

describe('secureFetch URL validation', () => {
    it('rejects an unparseable URL with reason invalid_url', async () => {
        await expectReason(
            secureFetch('not-a-url', BASE_OPTIONS),
            'invalid_url',
        );
        expect(mockedFetch).not.toHaveBeenCalled();
    });

    it('rejects an empty URL with reason invalid_url', async () => {
        await expectReason(secureFetch('', BASE_OPTIONS), 'invalid_url');
    });

    it('rejects http (non-https) with reason non_https', async () => {
        await expectReason(
            secureFetch('http://example.com/data.json', BASE_OPTIONS),
            'non_https',
        );
        expect(mockedFetch).not.toHaveBeenCalled();
    });
});

describe('secureFetch blocks private/internal resolved IPs', () => {
    const blocked: Array<[string, { address: string; family: number }]> = [
        ['IPv4 loopback 127.0.0.1', { address: '127.0.0.1', family: 4 }],
        ['IPv4 0.0.0.0/8', { address: '0.0.0.0', family: 4 }],
        ['IPv4 10/8 RFC1918', { address: '10.1.2.3', family: 4 }],
        ['IPv4 172.16/12 RFC1918', { address: '172.16.5.5', family: 4 }],
        ['IPv4 192.168/16 RFC1918', { address: '192.168.1.1', family: 4 }],
        ['IPv4 100.64/10 CGNAT', { address: '100.64.0.1', family: 4 }],
        [
            'IPv4 169.254 link-local/metadata',
            { address: '169.254.169.254', family: 4 },
        ],
        ['IPv4 224/4 multicast', { address: '224.0.0.1', family: 4 }],
        ['IPv6 ::1 loopback', { address: '::1', family: 6 }],
        ['IPv6 fc00::/7 unique-local', { address: 'fc00::1', family: 6 }],
        ['IPv6 fe80::/10 link-local', { address: 'fe80::1', family: 6 }],
        ['IPv6 ff00::/8 multicast', { address: 'ff02::1', family: 6 }],
        [
            'IPv6 mapped private ::ffff:169.254.169.254',
            { address: '::ffff:169.254.169.254', family: 6 },
        ],
    ];

    it.each(blocked)(
        'blocks %s with reason blocked_ip',
        async (_label, resolved) => {
            mockedLookup.mockResolvedValue([resolved]);
            await expectReason(
                secureFetch('https://evil.example.com/x.json', BASE_OPTIONS),
                'blocked_ip',
            );
            expect(mockedFetch).not.toHaveBeenCalled();
        },
    );

    it('blocks when ANY resolved address is private (mixed set)', async () => {
        mockedLookup.mockResolvedValue([
            { address: '93.184.216.34', family: 4 },
            { address: '10.0.0.5', family: 4 },
        ]);
        await expectReason(
            secureFetch('https://evil.example.com/x.json', BASE_OPTIONS),
            'blocked_ip',
        );
    });

    it('fails closed on unparseable IPv4 from DNS', async () => {
        mockedLookup.mockResolvedValue([{ address: '999.1.1.1', family: 4 }]);
        await expectReason(
            secureFetch('https://evil.example.com/x.json', BASE_OPTIONS),
            'blocked_ip',
        );
    });

    it('fails closed on unknown address family', async () => {
        mockedLookup.mockResolvedValue([{ address: '1.2.3.4', family: 0 }]);
        await expectReason(
            secureFetch('https://evil.example.com/x.json', BASE_OPTIONS),
            'blocked_ip',
        );
    });

    it('rejects with blocked_ip when DNS resolution fails', async () => {
        mockedLookup.mockRejectedValue(new Error('ENOTFOUND'));
        await expectReason(
            secureFetch('https://nope.example.com/x.json', BASE_OPTIONS),
            'blocked_ip',
        );
    });

    it('rejects with blocked_ip when DNS returns no addresses', async () => {
        mockedLookup.mockResolvedValue([]);
        await expectReason(
            secureFetch('https://empty.example.com/x.json', BASE_OPTIONS),
            'blocked_ip',
        );
    });
});

const jsonResponse = (
    body: string,
    init: {
        status?: number;
        contentType?: string;
        headers?: Record<string, string>;
    } = {},
): InstanceType<typeof Response> =>
    new Response(body, {
        status: init.status ?? 200,
        headers: {
            'content-type': init.contentType ?? 'application/json',
            ...(init.headers ?? {}),
        },
    });

describe('secureFetch GET behavior', () => {
    it('rejects a 3xx redirect with reason redirect', async () => {
        mockedFetch.mockResolvedValue(
            new Response('', {
                status: 302,
                headers: { location: 'https://elsewhere.example.com/x.json' },
            }),
        );
        await expectReason(
            secureFetch('https://example.com/x.json', BASE_OPTIONS),
            'redirect',
        );
    });

    it('rejects a non-ok status (>=400) with reason request_failed', async () => {
        mockedFetch.mockResolvedValue(jsonResponse('nope', { status: 503 }));
        await expectReason(
            secureFetch('https://example.com/x.json', BASE_OPTIONS),
            'request_failed',
        );
    });

    it('returns a SecureFetchResult on a happy-path GET', async () => {
        mockedFetch.mockResolvedValue(
            jsonResponse('{"hello":"world"}', { status: 200 }),
        );
        const result = await secureFetch(
            'https://example.com/x.json',
            BASE_OPTIONS,
        );
        expect(result).toEqual({
            status: 200,
            contentType: 'application/json',
            bodyText: '{"hello":"world"}',
            truncated: false,
        });
    });

    it('pins the agent to the validated IP and disables redirects', async () => {
        mockedLookup.mockResolvedValue([
            { address: '93.184.216.34', family: 4 },
        ]);
        mockedFetch.mockResolvedValue(jsonResponse('{}'));
        await secureFetch('https://example.com/x.json', BASE_OPTIONS);

        expect(mockedFetch).toHaveBeenCalledTimes(1);
        const [calledUrl, calledOpts] = mockedFetch.mock.calls[0];
        expect(calledUrl).toBe('https://example.com/x.json');
        expect(calledOpts.redirect).toBe('manual');
        expect(calledOpts.method).toBe('GET');
        expect(calledOpts.size).toBe(BASE_OPTIONS.maxResponseBytes);
        expect(calledOpts.agent).toBeDefined();
    });
});

describe('secureFetch timeout', () => {
    it('maps an aborted request to reason timeout', async () => {
        const abortError = new FetchError(
            'The user aborted a request.',
            'aborted',
        );
        mockedFetch.mockRejectedValue(abortError);
        await expectReason(
            secureFetch('https://example.com/x.json', {
                ...BASE_OPTIONS,
                timeoutMs: 1,
            }),
            'timeout',
        );
    });

    it('aborts the request after the configured timeout', async () => {
        jest.useFakeTimers();
        let capturedSignal: AbortSignal | undefined;
        // Use a real promise so dns.lookup mock settles without fake timers.
        let resolveFetch!: (value?: unknown) => void;
        mockedFetch.mockImplementation((_url, opts) => {
            capturedSignal = opts.signal as AbortSignal;
            return new Promise((resolve) => {
                resolveFetch = resolve;
            });
        });

        const pending = secureFetch('https://example.com/x.json', {
            ...BASE_OPTIONS,
            timeoutMs: 500,
        });
        // Flush microtasks: dns.lookup mock (real Promise) + then-chains.
        // We need several ticks because the async function has multiple awaits.
        for (let i = 0; i < 10; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            await Promise.resolve();
        }

        expect(capturedSignal?.aborted).toBe(false);
        jest.advanceTimersByTime(500);
        expect(capturedSignal?.aborted).toBe(true);

        // Let the pending promise settle.
        resolveFetch();
        await pending.catch(() => undefined);
        jest.useRealTimers();
    });

    it('hard-caps the timeout at 30000ms', async () => {
        jest.useFakeTimers();
        let capturedSignal: AbortSignal | undefined;
        let resolveFetch!: (value?: unknown) => void;
        mockedFetch.mockImplementation((_url, opts) => {
            capturedSignal = opts.signal as AbortSignal;
            return new Promise((resolve) => {
                resolveFetch = resolve;
            });
        });

        const pending = secureFetch('https://example.com/x.json', {
            ...BASE_OPTIONS,
            timeoutMs: 999999, // way over the cap
        });
        for (let i = 0; i < 10; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            await Promise.resolve();
        }

        expect(capturedSignal?.aborted).toBe(false);
        jest.advanceTimersByTime(29999);
        expect(capturedSignal?.aborted).toBe(false);
        jest.advanceTimersByTime(1);
        expect(capturedSignal?.aborted).toBe(true);

        resolveFetch();
        await pending.catch(() => undefined);
        jest.useRealTimers();
    });
});
