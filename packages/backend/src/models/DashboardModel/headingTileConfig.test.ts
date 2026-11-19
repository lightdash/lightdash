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

describe('heading tile config', () => {
    it('stores the chosen settings under the current version', () => {
        expect(
            toDbHeadingTileConfig({
                text: 'Revenue',
                size: DashboardHeadingSize.XS,
                verticalAlign: DashboardHeadingVerticalAlign.BOTTOM,
            }),
        ).toEqual({
            version: 1,
            size: DashboardHeadingSize.XS,
            textAlign: null,
            verticalAlign: DashboardHeadingVerticalAlign.BOTTOM,
        });
    });

    it('stores nothing for a heading with no setting chosen', () => {
        expect(
            toDbHeadingTileConfig({ text: 'Revenue', showDivider: true }),
        ).toBeNull();
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

    it('reads back only the settings that were chosen', () => {
        const stored = toDbHeadingTileConfig({
            text: 'Revenue',
            textAlign: DashboardHeadingTextAlign.CENTER,
        });
        expect(fromDbHeadingTileConfig(stored)).toEqual({
            textAlign: DashboardHeadingTextAlign.CENTER,
        });
    });

    it('adds nothing to a heading saved before the column existed', () => {
        expect(fromDbHeadingTileConfig(null)).toEqual({});
    });

    it('adds nothing from a version it does not know', () => {
        const future = {
            version: 2,
            size: DashboardHeadingSize.LG,
        } as unknown as DbHeadingTileConfig;
        expect(fromDbHeadingTileConfig(future)).toEqual({});
    });
});
