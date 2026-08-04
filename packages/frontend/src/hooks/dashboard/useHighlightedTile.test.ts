import { describe, expect, it } from 'vitest';
import { getTileLinkUrl } from './useHighlightedTile';

const baseArgs = {
    origin: 'https://app.lightdash.cloud',
    projectUuid: 'project-uuid',
    dashboardUuid: 'dashboard-uuid',
    tileUuid: 'tile-uuid',
    tileTabUuid: null,
    search: '',
};

describe('getTileLinkUrl', () => {
    it('links to the dashboard view with the highlighted tile', () => {
        expect(getTileLinkUrl(baseArgs)).toBe(
            'https://app.lightdash.cloud/projects/project-uuid/dashboards/dashboard-uuid/view?highlightTile=tile-uuid',
        );
    });

    it('includes the tile tab so the tile is mounted on load', () => {
        expect(getTileLinkUrl({ ...baseArgs, tileTabUuid: 'tab-uuid' })).toBe(
            'https://app.lightdash.cloud/projects/project-uuid/dashboards/dashboard-uuid/view/tabs/tab-uuid?highlightTile=tile-uuid',
        );
    });

    it('keeps existing search params and overrides a stale highlight', () => {
        expect(
            getTileLinkUrl({
                ...baseArgs,
                search: '?dateZoom=month&highlightTile=other-tile',
            }),
        ).toBe(
            'https://app.lightdash.cloud/projects/project-uuid/dashboards/dashboard-uuid/view?dateZoom=month&highlightTile=tile-uuid',
        );
    });
});
