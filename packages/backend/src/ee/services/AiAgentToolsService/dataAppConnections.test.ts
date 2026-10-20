import { ParameterError } from '@lightdash/common';
import {
    findUnlinkedConnectionMentions,
    planConnectionLinks,
} from './dataAppConnections';

const amplitude = {
    externalConnectionUuid: 'conn-amplitude',
    name: 'Amplitude',
    slug: 'amplitude-1',
};
const stripe = {
    externalConnectionUuid: 'conn-stripe',
    name: 'Stripe Billing',
    slug: 'stripe-billing',
};

describe('planConnectionLinks', () => {
    it('links found connections under aliases derived from their names', () => {
        expect(
            planConnectionLinks(
                [
                    {
                        slug: 'amplitude-1',
                        status: 'found',
                        connection: amplitude,
                    },
                    {
                        slug: 'stripe-billing',
                        status: 'found',
                        connection: stripe,
                    },
                ],
                [],
            ),
        ).toEqual([
            { externalConnectionUuid: 'conn-amplitude', alias: 'amplitude' },
            { externalConnectionUuid: 'conn-stripe', alias: 'stripe_billing' },
        ]);
    });

    it('skips connections already linked and avoids taken aliases', () => {
        expect(
            planConnectionLinks(
                [
                    {
                        slug: 'amplitude-1',
                        status: 'found',
                        connection: amplitude,
                    },
                    {
                        slug: 'stripe-billing',
                        status: 'found',
                        connection: stripe,
                    },
                ],
                [
                    { externalConnectionUuid: 'conn-amplitude', alias: 'amp' },
                    {
                        externalConnectionUuid: 'conn-other',
                        alias: 'stripe_billing',
                    },
                ],
            ),
        ).toEqual([
            {
                externalConnectionUuid: 'conn-stripe',
                alias: 'stripe_billing_2',
            },
        ]);
    });

    it('links a slug passed twice once', () => {
        expect(
            planConnectionLinks(
                [
                    {
                        slug: 'amplitude-1',
                        status: 'found',
                        connection: amplitude,
                    },
                    {
                        slug: 'amplitude-1',
                        status: 'found',
                        connection: amplitude,
                    },
                ],
                [],
            ),
        ).toEqual([
            { externalConnectionUuid: 'conn-amplitude', alias: 'amplitude' },
        ]);
    });

    it('rejects the whole request naming every unusable slug', () => {
        const plan = () =>
            planConnectionLinks(
                [
                    {
                        slug: 'amplitude-1',
                        status: 'found',
                        connection: amplitude,
                    },
                    { slug: 'mixpanel', status: 'not_found' },
                    { slug: 'hubspot', status: 'not_linkable' },
                ],
                [],
            );
        expect(plan).toThrow(ParameterError);
        expect(plan).toThrow(/"mixpanel" was not found/);
        expect(plan).toThrow(/"hubspot" is not available/);
        expect(plan).toThrow(/list_data_app_connections/);
        expect(plan).not.toThrow(/amplitude-1/);
    });
});

describe('findUnlinkedConnectionMentions', () => {
    it('warns about a connection named in the brief that is not linked', () => {
        expect(
            findUnlinkedConnectionMentions(
                'Use the AMPLITUDE connection for events',
                [amplitude, stripe],
                [],
            ),
        ).toEqual([
            'Brief mentions "Amplitude" (slug "amplitude-1") but it isn\'t linked to the app; pass externalConnectionSlugs: ["amplitude-1"] to link it.',
        ]);
    });

    it('matches by slug', () => {
        expect(
            findUnlinkedConnectionMentions(
                'pull from stripe-billing',
                [amplitude, stripe],
                [],
            ),
        ).toHaveLength(1);
    });

    it('ignores linked connections and partial words', () => {
        expect(
            findUnlinkedConnectionMentions(
                'Amplitude events and stripes',
                [amplitude, { ...stripe, name: 'Stripe', slug: 'stripe' }],
                ['conn-amplitude'],
            ),
        ).toEqual([]);
    });
});
