import {
    ApiConnectorType,
    ExploreType,
    ExternalSourceType,
    type SummaryExplore,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { exploreSourceIconOf } from './dataSourceIconOf';

const summary = (overrides: Partial<SummaryExplore>): SummaryExplore =>
    ({
        name: 'explore',
        label: 'Explore',
        tags: [],
        ...overrides,
    }) as SummaryExplore;

const externalSource = (sourceType: ExternalSourceType) =>
    summary({
        type: ExploreType.EXTERNAL_SOURCE,
        externalSource: { sourceUuid: 's', tableUuid: 't', sourceType },
    } as Partial<SummaryExplore>);

describe('exploreSourceIconOf', () => {
    it('keeps warehouse explores on the table icon', () => {
        expect(exploreSourceIconOf(summary({}), undefined)).toBeNull();
        expect(
            exploreSourceIconOf(
                summary({ type: ExploreType.VIRTUAL }),
                undefined,
            ),
        ).toBeNull();
    });

    it('shows a live data source by its integration', () => {
        expect(
            exploreSourceIconOf(
                summary({ type: ExploreType.API_SOURCE }),
                ApiConnectorType.GA4,
            ),
        ).toEqual({ type: 'live', integration: ApiConnectorType.GA4 });
    });

    it('shows a live data source without a known integration', () => {
        expect(
            exploreSourceIconOf(
                summary({ type: ExploreType.API_SOURCE }),
                undefined,
            ),
        ).toEqual({ type: 'live', integration: undefined });
    });

    it('shows CSV and Google Sheets sources by type', () => {
        expect(
            exploreSourceIconOf(
                externalSource(ExternalSourceType.CSV),
                undefined,
            ),
        ).toEqual({ type: 'csv' });
        expect(
            exploreSourceIconOf(
                externalSource(ExternalSourceType.GOOGLE_SHEETS),
                undefined,
            ),
        ).toEqual({ type: 'sheets' });
    });
});
