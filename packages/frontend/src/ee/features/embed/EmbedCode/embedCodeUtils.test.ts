import { type DecodedEmbed } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    getEmbedCodeAvailability,
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

describe('embed code availability', () => {
    it.each([
        {
            name: 'loading while the configuration is being fetched',
            input: {
                isLoading: true,
                errorStatusCode: undefined,
                config: undefined,
            },
            expected: 'loading',
        },
        {
            name: 'unavailable when the backend rejects the feature',
            input: {
                isLoading: false,
                errorStatusCode: 403,
                config: undefined,
            },
            expected: 'featureUnavailable',
        },
        {
            name: 'not configured when there is no embed secret',
            input: {
                isLoading: false,
                errorStatusCode: 404,
                config: undefined,
            },
            expected: 'notConfigured',
        },
        {
            name: 'blocked when the selected content is not allowlisted',
            input: {
                isLoading: false,
                errorStatusCode: undefined,
                config,
            },
            expected: 'targetNotAllowed',
        },
        {
            name: 'ready when configured and allowlisted',
            input: {
                isLoading: false,
                errorStatusCode: undefined,
                config,
            },
            expected: 'ready',
        },
    ])('$name', ({ input, expected }) => {
        expect(
            getEmbedCodeAvailability({
                ...input,
                target:
                    expected === 'ready'
                        ? target('chart', 'chart-existing')
                        : target('chart', 'chart-new'),
            }),
        ).toBe(expected);
    });
});
