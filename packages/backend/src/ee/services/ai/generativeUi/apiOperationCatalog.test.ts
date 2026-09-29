import { GENERATIVE_UI_ALLOWED_OPERATION_IDS } from '@lightdash/common';
import { generativeUiOperationsMock } from '@lightdash/common/src/ee/AiAgent/generativeUi/generativeUiSpec.mock';
import {
    createApiOperationCatalog,
    getGenerativeUiApiCatalog,
} from './apiOperationCatalog';

const catalog = getGenerativeUiApiCatalog();

const signatureOf = (operationId: string): string => {
    const description = catalog.describe(operationId);
    if (description === null) throw new Error(`No operation ${operationId}`);
    return description.signature;
};

describe('generative UI API operation catalog', () => {
    it('finds every allowlisted operation in the generated spec', () => {
        const missing = Array.from(GENERATIVE_UI_ALLOWED_OPERATION_IDS).filter(
            (operationId) => catalog.getOperation(operationId) === null,
        );

        expect(missing).toEqual([]);
    });

    it('matches the operation rows the common fixtures copy', () => {
        const byId = (a: { operationId: string }, b: { operationId: string }) =>
            a.operationId.localeCompare(b.operationId);

        expect(catalog.listForClient()).toEqual(
            [...generativeUiOperationsMock].sort(byId),
        );
    });

    it('keeps the newest API version of a repeated operationId', () => {
        expect(catalog.getOperation('getDashboardSchedulers')).toMatchObject({
            method: 'GET',
            pathTemplate: '/api/v2/dashboards/{dashboardUuid}/schedulers',
            kind: 'query',
        });
    });

    describe('search', () => {
        const idsFor = (query: string, kind: 'query' | 'mutation' | null) =>
            catalog.search(query, kind).map(({ operationId }) => operationId);

        it('ranks the operation that does what was asked first', () => {
            expect(idsFor('move charts to a space', null)[0]).toBe(
                'Move content',
            );
            expect(idsFor('delete space', null)[0]).toBe('DeleteSpace');
            expect(idsFor('dashboard schedules', 'query')[0]).toBe(
                'getDashboardSchedulers',
            );
        });

        it('filters by kind and returns nothing for unrelated words', () => {
            expect(
                catalog
                    .search('dashboard schedules', 'mutation')
                    .every(({ method }) => method !== 'GET'),
            ).toBe(true);
            expect(idsFor('zebra', null)).toEqual([]);
        });
    });

    describe('operation signatures', () => {
        it('prints path params, the auto-filled projectUuid and the body', () => {
            const description = catalog.describe('UpdateSpace');

            expect(description).toMatchObject({
                pathParams: ['spaceUuid'],
                autoFilledPathParams: ['projectUuid'],
            });
            expect(description?.signature).toContain(
                'UpdateSpace: PATCH /api/v1/projects/{projectUuid}/spaces/{spaceUuid} (mutation)',
            );
            expect(description?.signature).toContain(
                'spaceUuid: string; // The uuid of the space to update',
            );
            expect(description?.signature).toContain('  name: string;');
        });

        it('prints the Move content body the demo binds to', () => {
            const signature = signatureOf('Move content');

            expect(signature).toContain(
                [
                    'params.body: {',
                    '  action: {',
                    '    targetSpaceUuid: string | null;',
                    '    type: "move";',
                    '  };',
                ].join('\n'),
            );
            expect(signature).toContain('source: "dbt_explore" | "sql";');
            expect(signature).toContain('contentType: "chart";');
            expect(signature).toContain('uuid: string;');
            expect(signature).toContain('results: null');
        });

        it('unwraps the response envelope to its results', () => {
            const signature = signatureOf('ListSpacesInProject');

            expect(signature).toContain('params.path: none');
            expect(signature).toContain('results: ({');
            expect(signature).toContain('  uuid: string;');
            expect(signature).toContain('  name: string;');
            expect(signatureOf('DeleteSpace')).toContain('results: null');
        });

        it('describes the dashboard scheduler body its controller reads untyped', () => {
            const signature = signatureOf('createDashboardScheduler');

            expect(signature).not.toContain('params.body: none');
            expect(signature).toContain('cron: string;');
            expect(signature).toMatch(/^\s+targets: /m);
        });

        it('lists each literal of a union once', () => {
            expect(signatureOf('UpdateSpace')).not.toMatch(
                /"viewer"[^\n]*"viewer"/,
            );
        });

        it('returns null for an operation outside the allowlist', () => {
            expect(catalog.describe('updateSavedChart')).toBeNull();
            expect(catalog.getOperation('ListProjects')).toBeNull();
        });
    });

    it('stops at recursive and deeply nested schemas', () => {
        const nested = (depth: number): object =>
            depth === 0
                ? { type: 'string' }
                : {
                      type: 'object',
                      properties: { child: nested(depth - 1) },
                  };
        const synthetic = createApiOperationCatalog(
            {
                paths: {
                    '/api/v1/nodes/{nodeUuid}': {
                        parameters: [],
                        get: {
                            operationId: 'getNode',
                            parameters: [
                                {
                                    in: 'path',
                                    name: 'nodeUuid',
                                    required: true,
                                    schema: { type: 'string' },
                                },
                            ],
                            responses: {
                                '200': {
                                    content: {
                                        'application/json': {
                                            schema: {
                                                $ref: '#/components/schemas/ApiNode',
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
                components: {
                    schemas: {
                        ApiNode: {
                            type: 'object',
                            properties: {
                                results: { $ref: '#/components/schemas/Node' },
                            },
                        },
                        Node: {
                            type: 'object',
                            required: ['name'],
                            properties: {
                                name: { type: 'string' },
                                parent: { $ref: '#/components/schemas/Node' },
                                deep: nested(6),
                            },
                        },
                    },
                },
            },
            new Set(['getNode']),
        );

        const signature = synthetic.describe('getNode')?.signature ?? '';

        expect(signature).toContain('  name: string;');
        expect(signature).toContain('  parent?: Node;');
        expect(signature).toContain('child?: { … };');
    });
});
