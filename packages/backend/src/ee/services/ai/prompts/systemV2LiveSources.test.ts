import { ApiConnectorType } from '@lightdash/common';
import { getLiveSourcesSection } from './systemV2LiveSources';

describe('getLiveSourcesSection', () => {
    it('says nothing when the project has no live data sources', () => {
        expect(getLiveSourcesSection([])).toBe('');
    });

    it('lists the sources, declines funnels and sends field changes to an admin', () => {
        const section = getLiveSourcesSection([
            {
                connectionUuid: 'conn-1',
                name: 'Product analytics',
                connector: ApiConnectorType.POSTHOG,
                exploreNames: ['posthog_events'],
                target: 'PostHog project 303731, EU region',
                hint: null,
            },
        ]);

        expect(section).toContain(
            'Funnels, retention and user paths are not available',
        );
        expect(section).toContain('name="Product analytics"');
        expect(section).toContain('integration="PostHog"');
        expect(section).toContain('an admin can add fields');
        expect(section).not.toContain('conn-1');
    });

    it("names each source's explores, target and hint, keeping the sources apart", () => {
        expect(
            getLiveSourcesSection([
                {
                    connectionUuid: 'conn-1',
                    name: 'Search Console',
                    connector: ApiConnectorType.SEARCH_CONSOLE,
                    exploreNames: ['search_console_performance'],
                    target: 'Search Console site https://example.de/',
                    hint: 'German storefront',
                },
                {
                    connectionUuid: 'conn-2',
                    name: 'Search Console 2',
                    connector: ApiConnectorType.SEARCH_CONSOLE,
                    exploreNames: ['search_console_2_performance'],
                    target: 'Search Console site https://example.fr/',
                    hint: null,
                },
            ]),
        ).toMatchSnapshot();
    });
});
