import { ApiConnectorType } from '@lightdash/common';
import { GOOGLE_CONNECTORS, type GoogleApiGet } from './googleOAuth';

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

        await expect(listChoices(get, 'token')).resolves.toEqual([
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

        await expect(listChoices(get, 'token')).rejects.toThrow(
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
