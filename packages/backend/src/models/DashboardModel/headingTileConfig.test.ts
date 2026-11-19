import {
    DashboardHeadingSize,
    DashboardHeadingTextAlign,
    DashboardHeadingVerticalAlign,
} from '@lightdash/common';
import {
    fromDbHeadingTileConfig,
    toDbHeadingTileConfig,
    type DbHeadingTileConfig,
} from './headingTileConfig';

const DEFAULTS = {
    size: DashboardHeadingSize.MD,
    textAlign: DashboardHeadingTextAlign.LEFT,
    verticalAlign: DashboardHeadingVerticalAlign.CENTER,
};

describe('heading tile config', () => {
    it('stores every setting under the current version', () => {
        expect(
            toDbHeadingTileConfig({
                text: 'Revenue',
                size: DashboardHeadingSize.XS,
                verticalAlign: DashboardHeadingVerticalAlign.BOTTOM,
            }),
        ).toEqual({
            version: 1,
            size: DashboardHeadingSize.XS,
            textAlign: DashboardHeadingTextAlign.LEFT,
            verticalAlign: DashboardHeadingVerticalAlign.BOTTOM,
        });
    });

    it('reads back what it stored', () => {
        const stored = toDbHeadingTileConfig({
            text: 'Revenue',
            size: DashboardHeadingSize.LG,
            textAlign: DashboardHeadingTextAlign.RIGHT,
            verticalAlign: DashboardHeadingVerticalAlign.TOP,
        });
        expect(fromDbHeadingTileConfig(stored)).toEqual({
            size: DashboardHeadingSize.LG,
            textAlign: DashboardHeadingTextAlign.RIGHT,
            verticalAlign: DashboardHeadingVerticalAlign.TOP,
        });
    });

    it('reads a heading saved before the column existed as the defaults', () => {
        expect(fromDbHeadingTileConfig(null)).toEqual(DEFAULTS);
    });

    it('reads a version it does not know as the defaults', () => {
        const future = { version: 2 } as unknown as DbHeadingTileConfig;
        expect(fromDbHeadingTileConfig(future)).toEqual(DEFAULTS);
    });
});
