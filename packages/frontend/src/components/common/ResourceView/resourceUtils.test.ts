import { ContentType } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getFilteredContentTypes } from './resourceUtils';

describe('getFilteredContentTypes', () => {
    const space = [
        ContentType.DASHBOARD,
        ContentType.CHART,
        ContentType.COMPOSER_CHART,
    ];

    it('maps "Charts" to classic and composer charts where the listing has both', () => {
        expect(getFilteredContentTypes(ContentType.CHART, space)).toEqual([
            ContentType.CHART,
            ContentType.COMPOSER_CHART,
        ]);
        expect(
            getFilteredContentTypes(ContentType.CHART, [ContentType.CHART]),
        ).toEqual([ContentType.CHART]);
    });

    it('keeps every listed type with no filter, and any other filter as is', () => {
        expect(getFilteredContentTypes(undefined, space)).toEqual(space);
        expect(getFilteredContentTypes(ContentType.DASHBOARD, space)).toEqual([
            ContentType.DASHBOARD,
        ]);
    });
});
