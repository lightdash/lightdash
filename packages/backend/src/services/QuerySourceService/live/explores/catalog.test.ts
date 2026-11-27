import { ApiConnectorType, HYDRA_ENABLED_ENV } from '@lightdash/common';
import { toLiveSourceCatalog } from './catalog';

const entry = (id: string, builtIn = false) => ({
    id,
    label: id,
    builtIn,
    fields: [],
});

describe('toLiveSourceCatalog', () => {
    beforeEach(() => {
        vi.stubEnv(HYDRA_ENABLED_ENV, 'true');
    });
    afterEach(() => {
        vi.unstubAllEnvs();
    });
    const refreshedAt = new Date('2026-11-27T12:00:00Z');

    it('keeps objects whose ids are one path segment, and drops the rest', () => {
        const catalog = toLiveSourceCatalog(
            ApiConnectorType.HYDRA,
            {
                entries: [
                    entry('Invoice__c'),
                    entry('p_123_deal'),
                    entry('{object}'),
                    entry('a/b'),
                    entry('a b'),
                    entry('..%2f'),
                ],
            },
            refreshedAt,
        );
        expect(catalog).toEqual({
            refreshedAt: '2026-11-27T12:00:00.000Z',
            entries: [entry('Invoice__c'), entry('p_123_deal')],
        });
    });

    it('refuses a catalog that lists one object twice', () => {
        expect(() =>
            toLiveSourceCatalog(
                ApiConnectorType.HYDRA,
                { entries: [entry('Deals'), entry('Deals')] },
                refreshedAt,
            ),
        ).toThrow(/twice/);
    });
});
