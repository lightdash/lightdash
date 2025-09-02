import { test, expect } from '@playwright/test';
import { AnyType, SEED_PROJECT } from '@lightdash/common';
import { login, loginAsEditor, loginAsViewer } from '../support/auth';
import { chartMock } from '../support/mocks';

const apiUrl = '/api/v2';

interface ContentItem {
    uuid: string;
    contentType: string;
    name: string;
    lastUpdatedAt: number;
    views: number;
    space?: { uuid: string };
    search_rank?: number;
}

test.describe('Lightdash catalog all tables and fields', () => {
    let content: ContentItem[] = [];
    
    test.beforeEach(async ({ request }) => {
        await login(request);
    });

    test('Should list all content', async ({ request }) => {
        const response = await request.get(`${apiUrl}/content?pageSize=999`);
        expect(response.status()).toBe(200);
        
        const body = await response.json();
        content = body.results.data;
        const charts = body.results.data.filter(
            (d: ContentItem) => d.contentType === 'chart',
        );
        const dashboards = body.results.data.filter(
            (d: ContentItem) => d.contentType === 'dashboard',
        );

        expect(body.results.data.length).toBeGreaterThan(0);
        expect(charts.length).toBeGreaterThan(0);
        expect(dashboards.length).toBeGreaterThan(0);
    });

    test.describe('Test pagination', () => {
        test('Should pageSize', async ({ request }) => {
            const randomPageSize = Math.floor(Math.random() * 10 + 1);
            const response = await request.get(`${apiUrl}/content?pageSize=${randomPageSize}`);
            expect(response.status()).toBe(200);
            
            const body = await response.json();
            expect(body.results.data.length).toBe(randomPageSize);
            expect(body.results.pagination.pageSize).toBe(randomPageSize);
            expect(body.results.pagination.page).toBe(1);

            const uuids = body.results.data.map((d: ContentItem) => d.uuid);
            expect(uuids).toEqual(
                content.slice(0, randomPageSize).map((d) => d.uuid),
            );
        });

        test('Should second page', async ({ request }) => {
            const response = await request.get(`${apiUrl}/content?pageSize=2&page=2`);
            expect(response.status()).toBe(200);
            
            const body = await response.json();
            expect(body.results.data.length).toBe(2);
            expect(body.results.pagination.pageSize).toBe(2);
            expect(body.results.pagination.page).toBe(2);

            const uuids = body.results.data.map((d: ContentItem) => d.uuid);
            expect(uuids).toEqual(
                content.slice(2, 4).map((d) => d.uuid),
            );
        });

        test.skip('Should get page count', async ({ request }) => {
            const response = await request.get(`${apiUrl}/content?pageSize=2`);
            expect(response.status()).toBe(200);
            
            const body = await response.json();
            expect(body.results.pagination.totalPageCount).toBeGreaterThan(0);
        });
    });

    test.describe('Test order', () => {
        test('Should return charts and dashboards sorted by last_updated_at', async ({ request }) => {
            const response = await request.get(`${apiUrl}/content?pageSize=999`);
            expect(response.status()).toBe(200);
            
            const body = await response.json();
            content = body.results.data;
            const sortedByLastUpdated = [...content].sort(
                (a, b) => a.lastUpdatedAt - b.lastUpdatedAt,
            );
            expect(sortedByLastUpdated.map((d) => d.uuid)).toEqual(
                content.map((d) => d.uuid),
            );

            const sortedByViews = [...content].sort(
                (a, b) => a.views - b.views,
            );
            expect(sortedByViews.map((d) => d.uuid)).not.toEqual(
                content.map((d) => d.uuid),
            );

            const nextContentIsDifferent = (type: string) =>
                content.some((d, i) => {
                    if (d.contentType === type) {
                        return content[i + 1]?.contentType !== type;
                    }
                    return false;
                });
            expect(nextContentIsDifferent('dashboard')).toBe(true);
            expect(nextContentIsDifferent('chart')).toBe(true);
        });
    });

    test.describe('Filter by spaceUuids', () => {
        test('Filter by existing spaceUuid', async ({ request }) => {
            const response = await request.get(
                `${apiUrl}/content?spaceUuids=${content[0]?.space?.uuid}`,
            );
            expect(response.status()).toBe(200);
            
            const body = await response.json();
            expect(body.results.data.length).toBeGreaterThan(0);
            const uuids = body.results.data.map((d: ContentItem) => d.uuid);
            expect(uuids).toContain(content[0].uuid);
        });
    });

    test.describe('Filter by ContentTypes', () => {
        test('Should list only dashboards', async ({ request }) => {
            const response = await request.get(
                `${apiUrl}/content?pageSize=999&contentTypes=dashboard`,
            );
            expect(response.status()).toBe(200);
            
            const body = await response.json();
            const charts = body.results.data.filter(
                (d: ContentItem) => d.contentType === 'chart',
            );
            const dashboards = body.results.data.filter(
                (d: ContentItem) => d.contentType === 'dashboard',
            );

            expect(charts.length).toBe(0);
            expect(dashboards.length).toBeGreaterThan(0);
        });

        test('Should list only charts', async ({ request }) => {
            const response = await request.get(
                `${apiUrl}/content?pageSize=999&contentTypes=chart`,
            );
            expect(response.status()).toBe(200);
            
            const body = await response.json();
            const charts = body.results.data.filter(
                (d: ContentItem) => d.contentType === 'chart',
            );
            const dashboards = body.results.data.filter(
                (d: ContentItem) => d.contentType === 'dashboard',
            );

            expect(charts.length).toBeGreaterThan(0);
            expect(dashboards.length).toBe(0);
        });

        test('Should list charts and dashboards', async ({ request }) => {
            const response = await request.get(
                `${apiUrl}/content?pageSize=999&contentTypes=chart&contentTypes=dashboard`,
            );
            expect(response.status()).toBe(200);
            
            const body = await response.json();
            const charts = body.results.data.filter(
                (d: ContentItem) => d.contentType === 'chart',
            );
            const dashboards = body.results.data.filter(
                (d: ContentItem) => d.contentType === 'dashboard',
            );

            expect(charts.length).toBeGreaterThan(0);
            expect(dashboards.length).toBeGreaterThan(0);
        });
    });
});

test.describe('Permission tests', () => {
    test('As an admin, I should see public and private spaces', async ({ request }) => {
        await login(request);
        const response = await request.get(
            `${apiUrl}/content?contentTypes=space&projectUuids=${SEED_PROJECT.project_uuid}&page=1&pageSize=999&sortBy=last_updated_at&sortDirection=desc`,
        );
        expect(response.status()).toBe(200);
        
        const body = await response.json();
        const expectedSpaceNames = [
            'Parent Space 4',
            'Parent Space 3',
            'Parent Space 2',
            'Parent Space 1',
            SEED_PROJECT.name,
        ];
        const actualSpaceNames = body.results.data.map((d: ContentItem) => d.name);

        expect(
            expectedSpaceNames.every((name) =>
                actualSpaceNames.includes(name),
            ),
        ).toBe(true);

        const parentSpace2 = body.results.data.find(
            (d: ContentItem) => d.name === 'Parent Space 2',
        );
        expect(parentSpace2).toBeDefined();

        const childResponse = await request.get(
            `${apiUrl}/content?spaceUuids=${parentSpace2?.uuid}&contentTypes=dashboard&contentTypes=chart&contentTypes=space&projectUuids=${SEED_PROJECT.project_uuid}&page=1&pageSize=999&sortBy=last_updated_at&sortDirection=desc`,
        );
        expect(childResponse.status()).toBe(200);
        
        const childBody = await childResponse.json();
        expect(childBody.results.data.length).toBe(1);
        expect(childBody.results.data[0].name).toBe('Child Space 2.1');
    });

    test('As an editor, I should see public spaces and private spaces that belong to me', async ({ request }) => {
        await loginAsEditor(request);
        const response = await request.get(
            `${apiUrl}/content?contentTypes=space&projectUuids=${SEED_PROJECT.project_uuid}&page=1&pageSize=999&sortBy=last_updated_at&sortDirection=desc`,
        );
        expect(response.status()).toBe(200);
        
        const body = await response.json();
        const expectedSpaceNames = [
            'Parent Space 4',
            'Parent Space 3',
            'Parent Space 1',
            SEED_PROJECT.name,
        ];
        const actualSpaceNames = body.results.data.map((d: ContentItem) => d.name);

        expect(
            expectedSpaceNames.every((name) =>
                actualSpaceNames.includes(name),
            ),
        ).toBe(true);

        expect(actualSpaceNames.includes('Parent Space 2')).not.toBe(true);

        const parentSpace4 = body.results.data.find(
            (d: ContentItem) => d.name === 'Parent Space 4',
        );
        expect(parentSpace4).toBeDefined();

        const childResponse = await request.get(
            `${apiUrl}/content?spaceUuids=${parentSpace4?.uuid}&contentTypes=dashboard&contentTypes=chart&contentTypes=space&projectUuids=${SEED_PROJECT.project_uuid}&page=1&pageSize=999&sortBy=last_updated_at&sortDirection=desc`,
        );
        expect(childResponse.status()).toBe(200);
        
        const childBody = await childResponse.json();
        expect(childBody.results.data.length).toBe(1);
        expect(childBody.results.data[0].name).toBe('Child Space 4.1');
    });

    test('As a viewer, I should see public spaces and private spaces that belong to me', async ({ request }) => {
        await loginAsViewer(request);
        const response = await request.get(
            `${apiUrl}/content?contentTypes=space&projectUuids=${SEED_PROJECT.project_uuid}&page=1&pageSize=999&sortBy=last_updated_at&sortDirection=desc`,
        );
        expect(response.status()).toBe(200);
        
        const body = await response.json();
        const expectedSpaceNames = ['Parent Space 1', SEED_PROJECT.name];
        const actualSpaceNames = body.results.data.map((d: ContentItem) => d.name);

        expect(
            expectedSpaceNames.every((name) =>
                actualSpaceNames.includes(name),
            ),
        ).toBe(true);

        const parentSpace1 = body.results.data.find(
            (d: ContentItem) => d.name === 'Parent Space 1',
        );
        expect(parentSpace1).toBeDefined();

        expect(actualSpaceNames.includes('Parent Space 2')).not.toBe(true);
        expect(actualSpaceNames.includes('Parent Space 3')).not.toBe(true);
        expect(actualSpaceNames.includes('Parent Space 4')).not.toBe(true);

        const childResponse = await request.get(
            `${apiUrl}/content?spaceUuids=${parentSpace1?.uuid}&contentTypes=dashboard&contentTypes=chart&contentTypes=space&projectUuids=${SEED_PROJECT.project_uuid}&page=1&pageSize=999&sortBy=last_updated_at&sortDirection=desc`,
        );
        expect(childResponse.status()).toBe(200);
        
        const childBody = await childResponse.json();
        expect(childBody.results.data.length).toBe(3);
        expect(
            childBody.results.data
                .map((d: ContentItem) => d.name)
                .includes('Child Space 1.3'),
        ).toBe(true);
    });
});