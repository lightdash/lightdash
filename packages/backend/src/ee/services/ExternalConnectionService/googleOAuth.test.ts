import { ApiConnectorType } from '@lightdash/common';
import {
    GOOGLE_CONNECTORS,
    type GoogleApiGet,
    type GoogleApiPost,
} from './googleOAuth';

describe('GA4 property choices', () => {
    const { listChoices, toApiSource, choiceOf } =
        GOOGLE_CONNECTORS[ApiConnectorType.GA4];

    it('lists every property across accounts and pages', async () => {
        const get = vi
            .fn<GoogleApiGet>()
            .mockResolvedValueOnce({
                status: 200,
                body: {
                    accountSummaries: [
                        {
                            displayName: 'Acme',
                            propertySummaries: [
                                {
                                    property: 'properties/222',
                                    displayName: 'Website',
                                },
                            ],
                        },
                    ],
                    nextPageToken: 'page-2',
                },
            })
            .mockResolvedValueOnce({
                status: 200,
                body: {
                    accountSummaries: [
                        {
                            displayName: 'Beta',
                            propertySummaries: [
                                {
                                    property: 'properties/111',
                                    displayName: 'App',
                                },
                            ],
                        },
                    ],
                },
            });

        await expect(
            listChoices({ get, post: vi.fn() }, 'token'),
        ).resolves.toEqual([
            { value: '111', label: 'App', description: 'Beta · property 111' },
            {
                value: '222',
                label: 'Website',
                description: 'Acme · property 222',
            },
        ]);
        expect(get).toHaveBeenCalledTimes(2);
        expect(
            new URL(get.mock.calls[1][0]).searchParams.get('pageToken'),
        ).toBe('page-2');
    });

    it('explains a disabled Admin API', async () => {
        const get = vi
            .fn<GoogleApiGet>()
            .mockResolvedValue({ status: 403, body: {} });

        await expect(
            listChoices({ get, post: vi.fn() }, 'token'),
        ).rejects.toThrow(
            'Check that the Google Analytics Admin API is enabled',
        );
    });

    it('round-trips a chosen property', () => {
        const apiSource = toApiSource('111');
        expect(apiSource).toEqual({
            connector: ApiConnectorType.GA4,
            propertyId: '111',
        });
        expect(choiceOf(apiSource)).toBe('111');
    });
});

describe('Google Ads account choices', () => {
    const { listChoices, toApiSource, choiceOf } =
        GOOGLE_CONNECTORS[ApiConnectorType.GOOGLE_ADS];
    const client = (
        id: string,
        descriptiveName: string,
        status = 'ENABLED',
    ) => ({
        customerClient: { id, descriptiveName, currencyCode: 'USD', status },
    });
    const listed = (...ids: string[]) =>
        vi.fn<GoogleApiGet>().mockResolvedValue({
            status: 200,
            body: { resourceNames: ids.map((id) => `customers/${id}`) },
        });

    it('offers client accounts reached directly and through a manager', async () => {
        const post = vi
            .fn<GoogleApiPost>()
            .mockResolvedValueOnce({
                status: 200,
                body: { results: [client('2222222222', 'Direct')] },
            })
            .mockResolvedValueOnce({
                status: 200,
                body: {
                    results: [client('3333333333', 'Client', 'CANCELED')],
                },
            });

        await expect(
            listChoices(
                { get: listed('2222222222', '1111111111'), post },
                'token',
            ),
        ).resolves.toEqual([
            {
                value: '1111111111/3333333333',
                label: 'Client',
                description:
                    '333-333-3333 · USD · via manager 111-111-1111 · CANCELED',
            },
            {
                value: '2222222222',
                label: 'Direct',
                description: '222-222-2222 · USD',
            },
        ]);
        expect(post).toHaveBeenCalledWith(
            'https://googleads.googleapis.com/v26/customers/1111111111/googleAds:search',
            'token',
            {
                query: expect.stringContaining(
                    'customer_client.manager = FALSE',
                ),
            },
            { 'login-customer-id': '1111111111' },
        );
    });

    it('skips an account that can not be read when another can', async () => {
        const post = vi
            .fn<GoogleApiPost>()
            .mockResolvedValueOnce({ status: 403, body: {} })
            .mockResolvedValueOnce({
                status: 200,
                body: { results: [client('2222222222', 'Open')] },
            });

        await expect(
            listChoices(
                { get: listed('1111111111', '2222222222'), post },
                'token',
            ),
        ).resolves.toHaveLength(1);
    });

    it('reports the failure when no account can be read', async () => {
        const post = vi.fn<GoogleApiPost>().mockResolvedValue({
            status: 403,
            body: { error: { message: 'Project has test access' } },
        });

        await expect(
            listChoices({ get: listed('1111111111'), post }, 'token'),
        ).rejects.toThrow(/Project has test access/);
    });

    it('round-trips a choice through the stored source', () => {
        const viaManager = toApiSource('1111111111/3333333333');
        expect(viaManager).toEqual({
            connector: ApiConnectorType.GOOGLE_ADS,
            customerId: '3333333333',
            loginCustomerId: '1111111111',
        });
        expect(choiceOf(viaManager)).toBe('1111111111/3333333333');

        const direct = toApiSource('2222222222');
        expect(direct).toEqual({
            connector: ApiConnectorType.GOOGLE_ADS,
            customerId: '2222222222',
            loginCustomerId: null,
        });
        expect(choiceOf(direct)).toBe('2222222222');
    });
});
