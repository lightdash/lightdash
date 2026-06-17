import dns from 'dns/promises';
import fetch from 'node-fetch';
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
