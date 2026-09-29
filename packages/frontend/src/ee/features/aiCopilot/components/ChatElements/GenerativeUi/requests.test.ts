import {
    type GenerativeUiCompiledRequest,
    type GenerativeUiOperation,
} from '@lightdash/common';
import { generativeUiOperationsByIdMock } from '@lightdash/common/src/ee/AiAgent/generativeUi/generativeUiSpec.mock';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../../../../../../api';
import { type GenerativeUiBindingContext } from './bindings';
import { buildGenerativeUiRequest, lightdashApiFetcher } from './requests';

vi.mock('../../../../../../api', () => ({ lightdashApi: vi.fn() }));
const mockedLightdashApi = vi.mocked(lightdashApi);

const operation = (operationId: string): GenerativeUiOperation => {
    const found = generativeUiOperationsByIdMock.get(operationId);
    if (found === undefined) throw new Error(`No mock for ${operationId}`);
    return found;
};

const request = (
    operationId: string,
    params: Partial<GenerativeUiCompiledRequest['params']>,
): GenerativeUiCompiledRequest => ({
    operation: operation(operationId),
    params: { path: {}, query: {}, body: undefined, ...params },
});

const contextWith = (
    state: GenerativeUiBindingContext['state'],
): GenerativeUiBindingContext => ({
    state,
    queries: new Map(),
    results: new Map(),
    item: null,
});

describe('buildGenerativeUiRequest', () => {
    it('splits the API version off and encodes path params', () => {
        expect(
            buildGenerativeUiRequest(
                request('UpdateSpace', {
                    path: {
                        projectUuid: 'project 1',
                        spaceUuid: { $state: 'spaceUuid' },
                    },
                    body: { name: { $state: 'name' } },
                }),
                contextWith({ spaceUuid: 'a/b', name: 'Finance' }),
            ),
        ).toEqual({
            ok: true,
            request: {
                method: 'PATCH',
                version: 'v1',
                url: '/projects/project%201/spaces/a%2Fb',
                body: JSON.stringify({ name: 'Finance' }),
            },
        });
    });

    it('builds v2 paths and repeats array query params, skipping empty ones', () => {
        expect(
            buildGenerativeUiRequest(
                request('getDashboardSchedulers', {
                    path: { dashboardUuid: 'dashboard-1' },
                    query: {
                        searchQuery: null,
                        formats: { $state: 'formats' },
                        pageSize: 10,
                        includeLatestRun: true,
                    },
                }),
                contextWith({ formats: ['csv', 'image'] }),
            ),
        ).toEqual({
            ok: true,
            request: {
                method: 'GET',
                version: 'v2',
                url: '/dashboards/dashboard-1/schedulers?formats=csv&formats=image&pageSize=10&includeLatestRun=true',
                body: undefined,
            },
        });
    });

    it('fails without a request when a path param or query param cannot be used', () => {
        expect(
            buildGenerativeUiRequest(
                request('DeleteSpace', {
                    path: {
                        projectUuid: 'p',
                        spaceUuid: { $state: 'spaceUuid' },
                    },
                }),
                contextWith({ spaceUuid: null }),
            ),
        ).toEqual({
            ok: false,
            message: 'Path parameter "spaceUuid" has no value',
        });
        expect(
            buildGenerativeUiRequest(
                request('getFavorites', {
                    path: { projectUuid: 'p' },
                    query: { filter: { nested: 'object' } },
                }),
                contextWith({}),
            ),
        ).toEqual({
            ok: false,
            message:
                'Query parameter "filter" must be a string, number or boolean',
        });
    });
});

describe('lightdashApiFetcher', () => {
    afterEach(() => mockedLightdashApi.mockReset());

    it('never sends a body with GET', async () => {
        mockedLightdashApi.mockResolvedValue(null);

        await lightdashApiFetcher({
            method: 'GET',
            version: 'v2',
            url: '/dashboards/d/schedulers',
            body: '{}',
        });
        await lightdashApiFetcher({
            method: 'POST',
            version: 'v1',
            url: '/projects/p/spaces',
            body: '{"name":"Finance"}',
        });

        expect(mockedLightdashApi.mock.calls).toEqual([
            [
                {
                    method: 'GET',
                    version: 'v2',
                    url: '/dashboards/d/schedulers',
                    body: undefined,
                },
            ],
            [
                {
                    method: 'POST',
                    version: 'v1',
                    url: '/projects/p/spaces',
                    body: '{"name":"Finance"}',
                },
            ],
        ]);
    });
});
