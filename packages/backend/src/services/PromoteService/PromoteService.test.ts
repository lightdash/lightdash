import {
    defineUserAbility,
    NotFoundError,
    OrganizationMemberRole,
    ParameterError,
    SessionUser,
} from '@lightdash/common';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { S3CacheClient } from '../../clients/Aws/S3CacheClient';
import EmailClient from '../../clients/EmailClient/EmailClient';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { AnalyticsModel } from '../../models/AnalyticsModel';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { EmailModel } from '../../models/EmailModel';
import { JobModel } from '../../models/JobModel/JobModel';
import { OnboardingModel } from '../../models/OnboardingModel/OnboardingModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SpaceModel } from '../../models/SpaceModel';
import { SshKeyPairModel } from '../../models/SshKeyPairModel';
import { UserAttributesModel } from '../../models/UserAttributesModel';
import { UserWarehouseCredentialsModel } from '../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import { METRIC_QUERY, warehouseClientMock } from '../../queryBuilder.mock';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import { PromoteService } from './PromoteService';
import {
    existingUpstreamChart,
    missingUpstreamChart,
    promotedChart,
} from './PromoteService.mock';

describe('PromoteService changes', () => {
    test('getChartChanges create chart and space', async () => {
        const changes = PromoteService.getChartChanges(
            promotedChart,
            missingUpstreamChart,
        );

        expect(changes.charts.length).toBe(1);
        expect(changes.spaces.length).toBe(1);
        expect(changes.dashboards.length).toBe(0);

        expect(changes.charts[0].action).toBe('create');
        expect(changes.spaces[0].action).toBe('create');

        expect(changes.charts[0].data).toEqual({
            ...promotedChart.chart,
            oldUuid: promotedChart.chart.uuid,
            projectUuid: missingUpstreamChart.projectUuid,
            spaceSlug: promotedChart.space.slug,
        });

        expect(changes.spaces[0].data).toEqual({
            ...existingUpstreamChart.space,
            projectUuid: promotedChart.projectUuid,
        });
    });
    test('getChartChanges create chart but no space', async () => {
        const changes = PromoteService.getChartChanges(promotedChart, {
            ...missingUpstreamChart,
            space: existingUpstreamChart.space,
        });

        expect(changes.charts.length).toBe(1);
        expect(changes.spaces.length).toBe(1);
        expect(changes.dashboards.length).toBe(0);

        expect(changes.charts[0].action).toBe('create');
        expect(changes.spaces[0].action).toBe('no changes');

        expect(changes.charts[0].data).toEqual({
            ...promotedChart.chart,
            oldUuid: promotedChart.chart.uuid,
            projectUuid: missingUpstreamChart.projectUuid,
            spaceSlug: promotedChart.space.slug,
        });

        expect(changes.spaces[0].data).toEqual({
            ...existingUpstreamChart.space,
        });
    });

    test('getChartChanges update chart', async () => {
        const changes = PromoteService.getChartChanges(
            promotedChart,
            existingUpstreamChart,
        );

        expect(changes.charts.length).toBe(1);
        expect(changes.spaces.length).toBe(1);
        expect(changes.dashboards.length).toBe(0);

        expect(changes.charts[0].action).toBe('update');
        expect(changes.spaces[0].action).toBe('no changes');

        expect(changes.charts[0].data).toEqual({
            ...promotedChart.chart,
            chartKind: 'vertical_bar',
            chartType: 'cartesian',
            uuid: existingUpstreamChart.chart?.uuid,
            spaceUuid: existingUpstreamChart.chart?.spaceUuid,
            oldUuid: promotedChart.chart.uuid,
            projectUuid: missingUpstreamChart.projectUuid,
            spaceSlug: promotedChart.space.slug,
        });

        expect(changes.spaces[0].data).toEqual({
            ...existingUpstreamChart.space,
        });
    });

    test('getChartChanges update chart and create space', async () => {
        const changes = PromoteService.getChartChanges(promotedChart, {
            ...existingUpstreamChart,
            space: undefined,
        });

        expect(changes.charts.length).toBe(1);
        expect(changes.spaces.length).toBe(1);
        expect(changes.dashboards.length).toBe(0);

        expect(changes.charts[0].action).toBe('update');
        expect(changes.spaces[0].action).toBe('create');

        expect(changes.charts[0].data).toEqual({
            ...promotedChart.chart,
            chartKind: 'vertical_bar',
            chartType: 'cartesian',
            uuid: existingUpstreamChart.chart?.uuid,
            spaceUuid: existingUpstreamChart.chart?.spaceUuid,
            oldUuid: promotedChart.chart.uuid,
            projectUuid: missingUpstreamChart.projectUuid,
            spaceSlug: promotedChart.space.slug,
        });

        expect(changes.spaces[0].data).toEqual({
            ...existingUpstreamChart.space,
            projectUuid: promotedChart.projectUuid,
        });
    });
});
