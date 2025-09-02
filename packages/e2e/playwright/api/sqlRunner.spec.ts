/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from '@playwright/test';
import { ChartKind, CreateSqlChart, SEED_PROJECT, UpdateSqlChart } from '@lightdash/common';
import { login } from '../support/auth';

const apiUrl = '/api/v1';

test.describe('SQL Runner API', () => {
    test.beforeEach(async ({ request }) => {
        await login(request);
    });

    test('Saved SQL chart: create, update, get, delete', async ({ request }) => {
        // get first space in project
        const spacesResp = await request.get(`${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`);
        expect(spacesResp.status()).toBe(200);
        const spacesBody = await spacesResp.json();
        const space = spacesBody.results[0];
        expect(space).toBeDefined();

        const createPayload: CreateSqlChart = {
            name: 'test',
            description: null,
            sql: 'SELECT * FROM postgres.jaffle.payments',
            limit: 21,
            config: {
                display: {},
                metadata: { version: 1 },
                type: ChartKind.TABLE,
                columns: {},
            },
            spaceUuid: space.uuid,
        } as any; // CreateSqlChart from common may not include all fields, keep loose

        const createResp = await request.post(`${apiUrl}/projects/${SEED_PROJECT.project_uuid}/sqlRunner/saved`, {
            headers: { 'Content-Type': 'application/json' },
            data: createPayload,
        });
        expect(createResp.status()).toBe(200);
        const { results: createResults } = await createResp.json();
        const { savedSqlUuid } = createResults as { savedSqlUuid: string };
        expect(savedSqlUuid).toBeTruthy();

        const updatePayload: UpdateSqlChart = {
            unversionedData: { name: 'test update', description: null, spaceUuid: space.uuid },
            versionedData: {
                sql: 'SELECT * FROM postgres.jaffle.payments',
                limit: 22,
                config: { display: {}, metadata: { version: 1 }, type: ChartKind.TABLE, columns: {} },
            },
        } as any;

        const updateResp = await request.patch(`${apiUrl}/projects/${SEED_PROJECT.project_uuid}/sqlRunner/saved/${savedSqlUuid}`, {
            headers: { 'Content-Type': 'application/json' },
            data: updatePayload,
        });
        expect(updateResp.status()).toBe(200);

        const getResp = await request.get(`${apiUrl}/projects/${SEED_PROJECT.project_uuid}/sqlRunner/saved/${savedSqlUuid}`);
        expect(getResp.status()).toBe(200);
        const getBody = await getResp.json();
        expect(getBody.results.name).toBe('test update');
        expect(getBody.results.sql).toBe('SELECT * FROM postgres.jaffle.payments');

        const delResp = await request.delete(`${apiUrl}/projects/${SEED_PROJECT.project_uuid}/sqlRunner/saved/${savedSqlUuid}`);
        expect(delResp.status()).toBe(200);
    });
});
