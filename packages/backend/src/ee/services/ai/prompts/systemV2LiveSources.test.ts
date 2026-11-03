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
            },
        ]);

        expect(section).toContain(
            'Funnels, retention and user paths are not available',
        );
        expect(section).toContain('connectionUuid="conn-1"');
        expect(section).toContain('integration="PostHog"');
        expect(section).toContain('an admin can put it in use');
    });
});
