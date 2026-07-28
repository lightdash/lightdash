import { parseResourceLink } from './parseResourceLink';

const PROJECT = '3675b69e-8324-4110-bdca-059031aa8da3';
const DASHBOARD = '0f254e64-e553-4cfb-90fd-d9779815e75c';
const CHART = '11263a0c-ff19-4cf4-9b04-3656fdaa5a0f';

it('parses a dashboard link past its tab path and filter params', () => {
    expect(
        parseResourceLink(
            `https://app.lightdash.cloud/projects/${PROJECT}/dashboards/${DASHBOARD}/view/tabs/tab-1?filters=abc`,
        ),
    ).toEqual({
        type: 'dashboard',
        projectUuid: PROJECT,
        dashboardUuidOrSlug: DASHBOARD,
    });
});

// The only URL a chart saved inside a dashboard has — the case that name
// search can't reach at all.
it('parses the edit link of a chart saved within a dashboard', () => {
    expect(
        parseResourceLink(
            `https://app.lightdash.cloud/projects/${PROJECT}/saved/${CHART}/edit?fromDashboard=${DASHBOARD}`,
        ),
    ).toEqual({
        type: 'chart',
        projectUuid: PROJECT,
        chartUuidOrSlug: CHART,
    });
});

it('parses a bare path and the /minimal variant', () => {
    expect(parseResourceLink(`/projects/${PROJECT}/saved/${CHART}`)).toEqual({
        type: 'chart',
        projectUuid: PROJECT,
        chartUuidOrSlug: CHART,
    });
    expect(
        parseResourceLink(`/minimal/projects/${PROJECT}/dashboards/my-slug`),
    ).toEqual({
        type: 'dashboard',
        projectUuid: PROJECT,
        dashboardUuidOrSlug: 'my-slug',
    });
});

it('flags links that are recognised but not attachable', () => {
    expect(
        parseResourceLink('https://app.lightdash.cloud/share/AbCdEf12'),
    ).toEqual({ type: 'shortLink' });
    expect(
        parseResourceLink(
            `https://app.lightdash.cloud/projects/${PROJECT}/tables/orders?create_saved_chart_version=%7B%7D`,
        ),
    ).toEqual({ type: 'exploreState' });
});

it('returns null for search terms and for listing pages without an id', () => {
    expect(parseResourceLink('revenue per payment method')).toBeNull();
    expect(parseResourceLink('')).toBeNull();
    expect(parseResourceLink(`/projects/${PROJECT}/dashboards`)).toBeNull();
});
