import { type DecodedEmbed } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    getConfigAllowingTarget,
    isTargetAllowed,
    type EmbedCodeTarget,
} from './embedCodeUtils';

const config = {
    dashboardUuids: ['dashboard-existing'],
    allowAllDashboards: false,
    chartUuids: ['chart-existing'],
    allowAllCharts: false,
    appUuids: ['app-existing'],
    allowAllApps: false,
} as DecodedEmbed;

const target = (
    type: EmbedCodeTarget['type'],
    uuid: string,
): EmbedCodeTarget => ({
    type,
    uuid,
    name: 'Test content',
    spaceUuid: 'space-uuid',
});

describe('embed code allow list utilities', () => {
    it('recognizes explicitly allowed and allow-all content', () => {
        expect(isTargetAllowed(config, target('chart', 'chart-existing'))).toBe(
            true,
        );
        expect(
            isTargetAllowed(
                { ...config, allowAllDashboards: true },
                target('dashboard', 'dashboard-new'),
            ),
        ).toBe(true);
        expect(isTargetAllowed(config, target('chart', 'chart-new'))).toBe(
            false,
        );
    });

    it('adds a chart without replacing other embed allow lists', () => {
        expect(
            getConfigAllowingTarget(config, target('chart', 'chart-new')),
        ).toEqual({
            dashboardUuids: ['dashboard-existing'],
            allowAllDashboards: false,
            chartUuids: ['chart-existing', 'chart-new'],
            allowAllCharts: false,
            appUuids: ['app-existing'],
            allowAllApps: false,
        });
    });

    it('adds a dashboard only once', () => {
        expect(
            getConfigAllowingTarget(
                config,
                target('dashboard', 'dashboard-existing'),
            ).dashboardUuids,
        ).toEqual(['dashboard-existing']);
    });
});
