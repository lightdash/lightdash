import {
    getContentAsCodeWriteBackBranchName,
    getContentAsCodeWriteBackInstanceId,
} from './contentAsCodeWriteBack';

describe('content-as-code write-back branch names', () => {
    it('uses the SITE_URL host as the instance id', () => {
        expect(
            getContentAsCodeWriteBackInstanceId(
                'https://analytics.lightdash.cloud',
            ),
        ).toBe('analytics.lightdash.cloud');
    });

    it('builds an instance-scoped branch per slug', () => {
        expect(
            getContentAsCodeWriteBackBranchName(
                'analytics.lightdash.cloud',
                'orders',
            ),
        ).toBe('lightdash/write-back/analytics.lightdash.cloud/orders');
    });
});

describe('content-as-code write-back paths', () => {
    it('uses charts and dashboards folders under lightdash', async () => {
        const {
            getContentAsCodeChartRelativePath,
            getContentAsCodeDashboardRelativePath,
        } = await import('./contentAsCodePaths');
        expect(getContentAsCodeChartRelativePath('orders')).toBe(
            'lightdash/charts/orders.yml',
        );
        expect(getContentAsCodeDashboardRelativePath('weekly-kpis')).toBe(
            'lightdash/dashboards/weekly-kpis.yml',
        );
    });
});
