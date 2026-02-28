import { AnyType, SEED_PROJECT } from '@lightdash/common';
import type { Body } from '../helpers/api-client';
import { login, loginAsEditor, loginAsViewer } from '../helpers/auth';
import { chartMock } from '../helpers/mocks';

type ContentResults = { data: AnyType[] };

const apiUrl = '/api/v2';

describe('Lightdash catalog all tables and fields', () => {
    let admin: Awaited<ReturnType<typeof login>>;
    let content: AnyType[] = [];

    beforeAll(async () => {
        admin = await login();
    });

    it('Should list all content', async () => {
        const resp = await admin.get<Body<ContentResults>>(
            `${apiUrl}/content?pageSize=999`,
        );
        expect(resp.status).toBe(200);
        content = resp.body.results.data;
        const charts = resp.body.results.data.filter(
            (d: AnyType) => d.contentType === 'chart',
        );
        const dashboards = resp.body.results.data.filter(
            (d: AnyType) => d.contentType === 'dashboard',
        );

        expect(resp.body.results.data.length).toBeGreaterThan(0);
        expect(charts.length).toBeGreaterThan(0);
        expect(dashboards.length).toBeGreaterThan(0);
    });

    describe('Test order', () => {
        it('Should return charts and dashboards sorted by last_updated_at', async () => {
            const resp = await admin.get<Body<ContentResults>>(
                `${apiUrl}/content?pageSize=999`,
            );
            expect(resp.status).toBe(200);
            content = resp.body.results.data;
            const sortedByLastUpdated = [...content].sort(
                (a: AnyType, b: AnyType) => a.lastUpdatedAt - b.lastUpdatedAt,
            );
            expect(sortedByLastUpdated.map((d: AnyType) => d.uuid)).toEqual(
                content.map((d: AnyType) => d.uuid),
            );

            const sortedByViews = [...content].sort(
                (a: AnyType, b: AnyType) => a.views - b.views,
            );
            expect(sortedByViews.map((d: AnyType) => d.uuid)).not.toEqual(
                content.map((d: AnyType) => d.uuid),
            );

            const nextContentIsDifferent = (type: string) =>
                content.some((d: AnyType, i: number) => {
                    if (d.contentType === type) {
                        return content[i + 1]?.contentType !== type;
                    }
                    return false;
                });
            expect(nextContentIsDifferent('dashboard')).toBe(true);
            expect(nextContentIsDifferent('chart')).toBe(true);
        });
    });

    describe('Filter by spaceUuids', () => {
        it('Filter by existing spaceUuid', async () => {
            const resp = await admin.get<Body<ContentResults>>(
                `${apiUrl}/content?spaceUuids=${content[0]?.space?.uuid}`,
            );
            expect(resp.status).toBe(200);
            expect(resp.body.results.data.length).toBeGreaterThan(0);
            const uuids = resp.body.results.data.map((d: AnyType) => d.uuid);
            expect(uuids).toContain(content[0].uuid);
        });

        it('Filter by existing spaceUuid with new chart', async () => {
            const now = Date.now();

            const spaceResp = await admin.post<Body<{ uuid: string }>>(
                `/api/v1/projects/${SEED_PROJECT.project_uuid}/spaces/`,
                {
                    name: `Public space to promote ${now}`,
                    isPrivate: false,
                },
            );
            expect(spaceResp.status).toBe(200);
            const spaceUuid = spaceResp.body.results.uuid;

            const chartResp = await admin.post<Body<{ uuid: string }>>(
                `/api/v1/projects/${SEED_PROJECT.project_uuid}/saved`,
                {
                    ...chartMock,
                    name: `Chart to promote ${now}`,
                    spaceUuid,
                    dashboardUuid: null,
                },
            );
            expect(chartResp.status).toBe(200);
            const chart = chartResp.body.results;

            const resp = await admin.get<Body<ContentResults>>(
                `${apiUrl}/content?spaceUuids=${spaceUuid}`,
            );
            expect(resp.status).toBe(200);
            expect(resp.body.results.data.length).toBeGreaterThan(0);
            const uuids = resp.body.results.data.map((d: AnyType) => d.uuid);
            expect(uuids).toContain(chart.uuid);
            expect(uuids).not.toContain(content[0].uuid);
        });
    });

    describe('Filter by ContentTypes', () => {
        it('Should list only dashboards', async () => {
            const resp = await admin.get<Body<ContentResults>>(
                `${apiUrl}/content?pageSize=999&contentTypes=dashboard`,
            );
            expect(resp.status).toBe(200);
            const charts = resp.body.results.data.filter(
                (d: AnyType) => d.contentType === 'chart',
            );
            const dashboards = resp.body.results.data.filter(
                (d: AnyType) => d.contentType === 'dashboard',
            );
            expect(charts.length).toBe(0);
            expect(dashboards.length).toBeGreaterThan(0);
        });

        it('Should list only charts', async () => {
            const resp = await admin.get<Body<ContentResults>>(
                `${apiUrl}/content?pageSize=999&contentTypes=chart`,
            );
            expect(resp.status).toBe(200);
            const charts = resp.body.results.data.filter(
                (d: AnyType) => d.contentType === 'chart',
            );
            const dashboards = resp.body.results.data.filter(
                (d: AnyType) => d.contentType === 'dashboard',
            );
            expect(charts.length).toBeGreaterThan(0);
            expect(dashboards.length).toBe(0);
        });

        it('Should list charts and dashboards', async () => {
            const resp = await admin.get<Body<ContentResults>>(
                `${apiUrl}/content?pageSize=999&contentTypes=chart&contentTypes=dashboard`,
            );
            expect(resp.status).toBe(200);
            const charts = resp.body.results.data.filter(
                (d: AnyType) => d.contentType === 'chart',
            );
            const dashboards = resp.body.results.data.filter(
                (d: AnyType) => d.contentType === 'dashboard',
            );
            expect(charts.length).toBeGreaterThan(0);
            expect(dashboards.length).toBeGreaterThan(0);
        });
    });
});

describe('Permission tests', () => {
    it('As an admin, I should see public and private spaces', async () => {
        const admin = await login();
        const resp = await admin.get<Body<ContentResults>>(
            `${apiUrl}/content?contentTypes=space&projectUuids=${SEED_PROJECT.project_uuid}&page=1&pageSize=999&sortBy=last_updated_at&sortDirection=desc`,
        );
        expect(resp.status).toBe(200);
        const expectedSpaceNames = [
            'Parent Space 4',
            'Parent Space 3',
            'Parent Space 2',
            'Parent Space 1',
            SEED_PROJECT.name,
        ];
        const actualSpaceNames = resp.body.results.data.map(
            (d: AnyType) => d.name,
        );
        expect(
            expectedSpaceNames.every((name: string) =>
                actualSpaceNames.includes(name),
            ),
        ).toBe(true);

        const parentSpace2 = resp.body.results.data.find(
            (d: AnyType) => d.name === 'Parent Space 2',
        );
        expect(parentSpace2).toBeDefined();

        const res = await admin.get<Body<ContentResults>>(
            `${apiUrl}/content?spaceUuids=${parentSpace2?.uuid}&contentTypes=dashboard&contentTypes=chart&contentTypes=space&projectUuids=${SEED_PROJECT.project_uuid}&page=1&pageSize=999&sortBy=last_updated_at&sortDirection=desc`,
        );
        expect(res.status).toBe(200);
        expect(res.body.results.data.length).toBe(1);
        expect(res.body.results.data[0].name).toBe('Child Space 2.1');
    });

    it('As an editor, I should see public spaces and private spaces that belong to me', async () => {
        const editor = await loginAsEditor();
        const resp = await editor.get<Body<ContentResults>>(
            `${apiUrl}/content?contentTypes=space&projectUuids=${SEED_PROJECT.project_uuid}&page=1&pageSize=999&sortBy=last_updated_at&sortDirection=desc`,
        );
        expect(resp.status).toBe(200);
        const expectedSpaceNames = [
            'Parent Space 4',
            'Parent Space 3',
            'Parent Space 1',
            SEED_PROJECT.name,
        ];
        const actualSpaceNames = resp.body.results.data.map(
            (d: AnyType) => d.name,
        );
        expect(
            expectedSpaceNames.every((name: string) =>
                actualSpaceNames.includes(name),
            ),
        ).toBe(true);
        expect(actualSpaceNames.includes('Parent Space 2')).not.toBe(true);

        const parentSpace4 = resp.body.results.data.find(
            (d: AnyType) => d.name === 'Parent Space 4',
        );
        expect(parentSpace4).toBeDefined();

        const res = await editor.get<Body<ContentResults>>(
            `${apiUrl}/content?spaceUuids=${parentSpace4?.uuid}&contentTypes=dashboard&contentTypes=chart&contentTypes=space&projectUuids=${SEED_PROJECT.project_uuid}&page=1&pageSize=999&sortBy=last_updated_at&sortDirection=desc`,
        );
        expect(res.status).toBe(200);
        expect(res.body.results.data.length).toBe(1);
        expect(res.body.results.data[0].name).toBe('Child Space 4.1');
    });

    it('As a viewer, I should see public spaces and private spaces that belong to me', async () => {
        const viewer = await loginAsViewer();
        const resp = await viewer.get<Body<ContentResults>>(
            `${apiUrl}/content?contentTypes=space&projectUuids=${SEED_PROJECT.project_uuid}&page=1&pageSize=999&sortBy=last_updated_at&sortDirection=desc`,
        );
        expect(resp.status).toBe(200);
        const expectedSpaceNames = ['Parent Space 1', SEED_PROJECT.name];
        const actualSpaceNames = resp.body.results.data.map(
            (d: AnyType) => d.name,
        );
        expect(
            expectedSpaceNames.every((name: string) =>
                actualSpaceNames.includes(name),
            ),
        ).toBe(true);

        const parentSpace1 = resp.body.results.data.find(
            (d: AnyType) => d.name === 'Parent Space 1',
        );
        expect(parentSpace1).toBeDefined();
        expect(actualSpaceNames.includes('Parent Space 2')).not.toBe(true);
        expect(actualSpaceNames.includes('Parent Space 3')).not.toBe(true);
        expect(actualSpaceNames.includes('Parent Space 4')).not.toBe(true);

        const res = await viewer.get<Body<ContentResults>>(
            `${apiUrl}/content?spaceUuids=${parentSpace1?.uuid}&contentTypes=dashboard&contentTypes=chart&contentTypes=space&projectUuids=${SEED_PROJECT.project_uuid}&page=1&pageSize=999&sortBy=last_updated_at&sortDirection=desc`,
        );
        expect(res.status).toBe(200);
        expect(res.body.results.data.length).toBeGreaterThanOrEqual(3);
        expect(
            res.body.results.data
                .map((d: AnyType) => d.name)
                .includes('Child Space 1.3'),
        ).toBe(true);
    });
});
