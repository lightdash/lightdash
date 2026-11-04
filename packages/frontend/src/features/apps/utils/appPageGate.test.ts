import { DATA_APP_VIZ_TEMPLATE } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getAppPageGate } from './appPageGate';

const appUuid = '4d1f6c0e-3b0a-4f43-9d7a-2b1c9e8f7a61';

const gate = (overrides: Partial<Parameters<typeof getAppPageGate>[0]>) =>
    getAppPageGate({
        isDataAppsFlagLoading: false,
        isDataAppsEnabled: false,
        isChartStudioAvailable: true,
        urlAppUuid: appUuid,
        isLoadingApp: false,
        app: {
            appUuid,
            slug: 'my-chart-type',
            template: DATA_APP_VIZ_TEMPLATE,
        },
        ...overrides,
    });

describe('getAppPageGate', () => {
    it('opens a chart type in its builder with Chart Studio and data apps off', () => {
        expect(gate({})).toEqual({
            kind: 'chartTypeBuilder',
            appUuidOrSlug: 'my-chart-type',
        });
    });

    it('falls back to the uuid when the chart type has no slug', () => {
        expect(
            gate({
                app: { appUuid, slug: null, template: DATA_APP_VIZ_TEMPLATE },
            }),
        ).toEqual({ kind: 'chartTypeBuilder', appUuidOrSlug: appUuid });
    });

    it('waits for the app before deciding, instead of sending it home', () => {
        expect(gate({ isLoadingApp: true, app: null })).toEqual({
            kind: 'wait',
        });
    });

    it('sends a data app home when data apps are off', () => {
        expect(
            gate({ app: { appUuid, slug: 'sales', template: null } }),
        ).toEqual({ kind: 'home' });
    });

    it('sends a new app home when data apps are off', () => {
        expect(
            gate({ urlAppUuid: undefined, isLoadingApp: false, app: null }),
        ).toEqual({ kind: 'home' });
    });

    it('sends everything home without data apps or Chart Studio', () => {
        expect(gate({ isChartStudioAvailable: false })).toEqual({
            kind: 'home',
        });
    });

    it('opens data apps when the flag is on', () => {
        expect(
            gate({
                isDataAppsEnabled: true,
                app: { appUuid, slug: 'sales', template: null },
            }),
        ).toEqual({ kind: 'dataApp' });
    });

    it('redirects chart types to the builder when the flag is on', () => {
        expect(gate({ isDataAppsEnabled: true })).toEqual({
            kind: 'chartTypeBuilder',
            appUuidOrSlug: 'my-chart-type',
        });
    });

    it('sends a chart type home without Chart Studio, even with the flag on', () => {
        expect(
            gate({ isDataAppsEnabled: true, isChartStudioAvailable: false }),
        ).toEqual({ kind: 'home' });
    });

    it('waits while the data apps flag loads', () => {
        expect(gate({ isDataAppsFlagLoading: true })).toEqual({ kind: 'wait' });
    });
});
