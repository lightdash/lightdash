import { DashboardTileTypes } from '@lightdash/common';
import {
    remapAiSummaryTileConfig,
    toAiSummaryTile,
    type DbAiSummaryTileConfig,
} from './aiSummaryTiles';

const base = { uuid: 'tile', x: 0, y: 0, w: 12, h: 6, tabUuid: null };

describe('toAiSummaryTile', () => {
    it('returns the stored instructions and scope', () => {
        const tile = toAiSummaryTile(base, {
            ai_summary_title: 'Revenue insights',
            ai_summary_config: {
                version: 1,
                instructions: 'Suggest an action',
                scope: { type: 'tiles', tileUuids: ['a'] },
            },
        });

        expect(tile).toEqual({
            ...base,
            type: DashboardTileTypes.AI_SUMMARY,
            properties: {
                title: 'Revenue insights',
                instructions: 'Suggest an action',
                scope: { type: 'tiles', tileUuids: ['a'] },
            },
        });
    });

    it('summarises the whole tab when the stored config is from a newer version', () => {
        const tile = toAiSummaryTile(base, {
            ai_summary_title: 'Revenue insights',
            ai_summary_config: {
                version: 2,
            } as unknown as DbAiSummaryTileConfig,
        });

        expect(tile.properties).toEqual({
            title: 'Revenue insights',
            instructions: null,
            scope: { type: 'tab' },
        });
    });
});

describe('remapAiSummaryTileConfig', () => {
    it('points picked charts at their copies and keeps ones with no copy', () => {
        const remapped = remapAiSummaryTileConfig(
            {
                version: 1,
                instructions: null,
                scope: { type: 'tiles', tileUuids: ['a', 'b'] },
            },
            new Map([['a', 'copy-of-a']]),
        );

        expect(remapped.scope).toEqual({
            type: 'tiles',
            tileUuids: ['copy-of-a', 'b'],
        });
    });

    it('leaves a whole-tab summary as it is', () => {
        const config: DbAiSummaryTileConfig = {
            version: 1,
            instructions: 'Keep it short',
            scope: { type: 'tab' },
        };

        expect(remapAiSummaryTileConfig(config, new Map())).toEqual(config);
    });
});
