import {
    type GenerativeUiBlock,
    type GenerativeUiSpec,
    type GenerativeUiStep,
} from '../schemas/tools/toolGenerateUiArgs';
import { compileGenerativeUiSpec } from './compileGenerativeUiSpec';
import {
    deleteWithConfirmSpecMock,
    dependentQuerySpecMock,
    everyBlockSpecMock,
    forEachChainSpecMock,
    GENERATIVE_UI_PROJECT_UUID_MOCK,
    generativeUiOperationsByIdMock,
    invalidSpecMock,
    moveChartsSpecMock,
    staticRowsSpecMock,
} from './generativeUiSpec.mock';

const context = {
    operations: generativeUiOperationsByIdMock,
    projectUuid: GENERATIVE_UI_PROJECT_UUID_MOCK,
};

const problemsOf = (spec: GenerativeUiSpec): string[] => {
    const result = compileGenerativeUiSpec(spec, context);
    return result.ok ? [] : result.problems;
};

const nameInput: GenerativeUiBlock = {
    type: 'textInput',
    key: 'name',
    label: 'Name',
};

const specWith = ({
    blocks = [nameInput],
    steps = [{ id: 'validate', operationId: 'ValidateProject' }],
    queries,
    confirm,
}: {
    blocks?: GenerativeUiBlock[];
    steps?: GenerativeUiStep[];
    queries?: GenerativeUiSpec['queries'];
    confirm?: string;
}): GenerativeUiSpec => ({
    version: 1,
    title: 'Test',
    queries,
    blocks,
    action: { label: 'Go', confirm, steps },
});

const operation = (operationId: string) => {
    const found = generativeUiOperationsByIdMock.get(operationId);
    if (found === undefined) throw new Error(`No mock for ${operationId}`);
    return found;
};

describe('compileGenerativeUiSpec', () => {
    it.each(
        Object.entries({
            moveChartsSpecMock,
            everyBlockSpecMock,
            dependentQuerySpecMock,
            forEachChainSpecMock,
            deleteWithConfirmSpecMock,
            staticRowsSpecMock,
        }),
    )('accepts %s', (_name, spec) => {
        expect(problemsOf(spec)).toEqual([]);
    });

    it('binds queries and steps to operations and fills in projectUuid', () => {
        expect(compileGenerativeUiSpec(moveChartsSpecMock, context)).toEqual({
            ok: true,
            compiled: {
                spec: moveChartsSpecMock,
                queries: [
                    {
                        id: 'spaces',
                        operation: operation('ListSpacesInProject'),
                        params: {
                            path: {
                                projectUuid: GENERATIVE_UI_PROJECT_UUID_MOCK,
                            },
                            query: {},
                            body: undefined,
                        },
                    },
                    {
                        id: 'charts',
                        operation: operation('ListChartSummariesInProject'),
                        params: {
                            path: {
                                projectUuid: GENERATIVE_UI_PROJECT_UUID_MOCK,
                            },
                            query: {},
                            body: undefined,
                        },
                    },
                ],
                steps: [
                    {
                        step: moveChartsSpecMock.action.steps[0],
                        operation: operation('Move content'),
                        params: {
                            path: {
                                projectUuid: GENERATIVE_UI_PROJECT_UUID_MOCK,
                            },
                            query: {},
                            body: moveChartsSpecMock.action.steps[0].params
                                ?.body,
                        },
                    },
                ],
            },
        });
    });

    it('leaves path params alone when the operation has no projectUuid', () => {
        const result = compileGenerativeUiSpec(dependentQuerySpecMock, context);

        expect(result.ok && result.compiled.queries[1].params.path).toEqual({
            dashboardUuid: { $state: 'dashboardUuid' },
        });
        expect(result.ok && result.compiled.steps[0].params.path).toEqual({
            schedulerUuid: { $state: 'schedulerUuid' },
        });
    });

    it('returns every problem at once', () => {
        expect(problemsOf(invalidSpecMock)).toEqual([
            'action.steps[0].params.path.projectUuid: projectUuid is filled in from the conversation; remove it',
            'action.steps[0].operationId: "updateSavedChart" is not an operation generateUi may call; find one with searchApi',
        ]);
    });

    describe('operations', () => {
        it('rejects allowlisted operations missing from the catalog', () => {
            const result = compileGenerativeUiSpec(specWith({}), {
                ...context,
                operations: new Map(),
            });

            expect(result.ok ? [] : result.problems).toEqual([
                'action.steps[0].operationId: "ValidateProject" is not in the API catalog',
            ]);
        });

        it('requires GET queries and non-GET steps', () => {
            expect(
                problemsOf(
                    specWith({
                        queries: {
                            validate: { operationId: 'ValidateProject' },
                        },
                        steps: [
                            { id: 'list', operationId: 'ListSpacesInProject' },
                        ],
                    }),
                ),
            ).toEqual([
                'queries.validate.operationId: queries must be GET operations, and "ValidateProject" is POST; make it an action step',
                'action.steps[0].operationId: steps must not be GET operations; declare "ListSpacesInProject" as a query',
            ]);
        });

        it('rejects missing, unknown and non-scalar path params', () => {
            expect(
                problemsOf(
                    specWith({
                        steps: [
                            {
                                id: 'rename',
                                operationId: 'UpdateSpace',
                                params: { path: { spaceId: 'a', extra: null } },
                            },
                            {
                                id: 'delete',
                                operationId: 'deleteScheduler',
                                params: { path: { schedulerUuid: true } },
                            },
                        ],
                        confirm: 'Delete?',
                    }),
                ),
            ).toEqual([
                'action.steps[0].params.path.spaceId: "UpdateSpace" has no path parameter "spaceId"',
                'action.steps[0].params.path.extra: "UpdateSpace" has no path parameter "extra"',
                'action.steps[0].params.path: missing path parameter "spaceUuid" (/api/v1/projects/{projectUuid}/spaces/{spaceUuid})',
                'action.steps[1].params.path.schedulerUuid: path parameters must be strings, numbers or references',
            ]);
        });

        it('requires a confirmation when a step uses DELETE', () => {
            const { confirm: _confirm, ...action } =
                deleteWithConfirmSpecMock.action;

            expect(
                problemsOf({ ...deleteWithConfirmSpecMock, action }),
            ).toEqual([
                'action.confirm: required because step "deleteSpace" uses DELETE',
            ]);
        });
    });

    describe('references', () => {
        it('rejects $state keys that no input declares', () => {
            expect(
                problemsOf(
                    specWith({
                        blocks: [
                            {
                                ...nameInput,
                                visibleWhen: {
                                    $state: 'missing',
                                    equals: true,
                                },
                            },
                        ],
                        steps: [
                            {
                                id: 'create',
                                operationId: 'CreateSpaceInProject',
                                params: { body: { name: { $state: 'title' } } },
                            },
                        ],
                    }),
                ),
            ).toEqual([
                'blocks[0].visibleWhen.$state: "missing" is not the key of an input or table selection',
                'action.steps[0].params.body.name: "title" is not the key of an input or table selection',
            ]);
        });

        it('rejects $query ids that are not declared', () => {
            expect(
                problemsOf(
                    specWith({
                        blocks: [
                            {
                                type: 'select',
                                key: 'spaceUuid',
                                label: 'Space',
                                options: {
                                    $query: 'spaces',
                                    label: 'name',
                                    value: 'uuid',
                                },
                            },
                            {
                                type: 'table',
                                rows: { $query: 'charts' },
                                columns: [{ key: 'name', label: 'Chart' }],
                            },
                        ],
                    }),
                ),
            ).toEqual([
                'blocks[0].options.$query: "spaces" is not a declared query',
                'blocks[1].rows.$query: "charts" is not a declared query',
            ]);
        });

        it('lets query params reference $state only', () => {
            expect(
                problemsOf(
                    specWith({
                        queries: {
                            user: { operationId: 'GetAuthenticatedUser' },
                            space: {
                                operationId: 'GetSpace',
                                params: {
                                    path: {
                                        spaceUuid: {
                                            $query: 'user',
                                            path: 'userUuid',
                                        },
                                    },
                                    query: {
                                        a: { $result: 'validate' },
                                        b: { $item: '' },
                                    },
                                },
                            },
                        },
                    }),
                ),
            ).toEqual([
                'queries.space.params.path.spaceUuid: query params may only reference $state',
                'queries.space.params.query.a: $result is only allowed in action steps',
                'queries.space.params.query.b: $item is only allowed inside a forEach step',
            ]);
        });

        it('rejects $result for the same or a later step', () => {
            expect(
                problemsOf(
                    specWith({
                        steps: [
                            {
                                id: 'first',
                                operationId: 'CreateSpaceInProject',
                                params: {
                                    body: {
                                        name: { $result: 'first' },
                                        parentSpaceUuid: { $result: 'second' },
                                    },
                                },
                            },
                            { id: 'second', operationId: 'ValidateProject' },
                        ],
                    }),
                ),
            ).toEqual([
                'action.steps[0].params.body.name: "first" is not an earlier step',
                'action.steps[0].params.body.parentSpaceUuid: "second" is not an earlier step',
            ]);
        });

        it('rejects $item outside forEach steps', () => {
            expect(
                problemsOf(
                    specWith({
                        steps: [
                            {
                                id: 'create',
                                operationId: 'CreateSpaceInProject',
                                params: { body: { name: { $item: '' } } },
                            },
                        ],
                    }),
                ),
            ).toEqual([
                'action.steps[0].params.body.name: $item is only allowed inside a forEach step',
            ]);
        });

        it('rejects object keys that look like broken references', () => {
            expect(
                problemsOf(
                    specWith({
                        steps: [
                            {
                                id: 'create',
                                operationId: 'CreateSpaceInProject',
                                params: {
                                    body: {
                                        name: { $state: 'name', path: 'x' },
                                    },
                                },
                            },
                        ],
                    }),
                ),
            ).toEqual([
                'action.steps[0].params.body.name.$state: keys starting with "$" are reserved for references; check the reference syntax',
            ]);
        });
    });

    describe('forEach', () => {
        const multiSelect: GenerativeUiBlock = {
            type: 'multiSelect',
            key: 'chartUuids',
            label: 'Charts',
            options: [{ label: 'Revenue', value: 'chart-1' }],
        };
        const favorite = (forEach: GenerativeUiStep['forEach']) => ({
            id: 'favorite',
            operationId: 'toggleFavorite',
            forEach,
            params: { body: { contentUuid: { $item: '' } } },
        });

        it('requires the step to read its element', () => {
            expect(
                problemsOf(
                    specWith({
                        blocks: [multiSelect],
                        steps: [
                            {
                                id: 'favorite',
                                operationId: 'toggleFavorite',
                                forEach: { $state: 'chartUuids' },
                                params: { body: { contentType: 'chart' } },
                            },
                        ],
                    }),
                ),
            ).toEqual([
                'action.steps[0].params: a forEach step must read its element with {"$item": path}',
            ]);
        });

        it('rejects iterating an input that holds one value', () => {
            expect(
                problemsOf(specWith({ steps: [favorite({ $state: 'name' })] })),
            ).toEqual([
                'action.steps[0].forEach: "name" holds one value; forEach needs a multiSelect or a table with multiple selection',
            ]);
        });

        it('iterates an earlier forEach result, but not a later step', () => {
            expect(
                problemsOf(
                    specWith({
                        blocks: [multiSelect],
                        steps: [
                            favorite({ $state: 'chartUuids' }),
                            {
                                ...favorite({ $result: 'favorite' }),
                                id: 'again',
                            },
                        ],
                    }),
                ),
            ).toEqual([]);
            expect(
                problemsOf(
                    specWith({
                        blocks: [multiSelect],
                        steps: [favorite({ $result: 'favorite' })],
                    }),
                ),
            ).toEqual([
                'action.steps[0].forEach: "favorite" is not an earlier step',
            ]);
        });
    });

    describe('blocks', () => {
        it('rejects duplicate keys and step ids', () => {
            expect(
                problemsOf(
                    specWith({
                        blocks: [
                            nameInput,
                            {
                                type: 'table',
                                rows: [],
                                columns: [{ key: 'name', label: 'Name' }],
                                selectable: {
                                    key: 'name',
                                    rowKey: 'uuid',
                                    multiple: false,
                                },
                            },
                        ],
                        steps: [
                            { id: 'validate', operationId: 'ValidateProject' },
                            { id: 'validate', operationId: 'ValidateProject' },
                        ],
                    }),
                ),
            ).toEqual([
                'blocks[1].selectable.key: duplicate key "name"',
                'action.steps[1].id: duplicate step id "validate"',
            ]);
        });

        it('checks static table rows', () => {
            expect(
                problemsOf(
                    specWith({
                        blocks: [
                            {
                                type: 'table',
                                rows: [
                                    { uuid: 'a', name: 'Revenue' },
                                    { name: 'Orders' },
                                    Object.fromEntries(
                                        Array.from(
                                            { length: 9 },
                                            (_, index) => [
                                                `column${index}`,
                                                index,
                                            ],
                                        ),
                                    ),
                                ],
                                columns: [{ key: 'name', label: 'Chart' }],
                                selectable: {
                                    key: 'chartUuids',
                                    rowKey: 'uuid',
                                    multiple: true,
                                },
                            },
                        ],
                    }),
                ),
            ).toEqual([
                'blocks[0].rows[1]: needs a string or number "uuid" (selectable.rowKey)',
                'blocks[0].rows[2]: 9 keys; the limit is 8',
                'blocks[0].rows[2]: needs a string or number "uuid" (selectable.rowKey)',
            ]);
        });

        it('checks initial values against static options and number bounds', () => {
            const options = [
                { label: 'Daily', value: 'daily' },
                { label: 'Weekly', value: 'weekly' },
            ];

            expect(
                problemsOf(
                    specWith({
                        blocks: [
                            {
                                type: 'select',
                                key: 'frequency',
                                label: 'Frequency',
                                options,
                                initial: 'hourly',
                            },
                            {
                                type: 'multiSelect',
                                key: 'frequencies',
                                label: 'Frequencies',
                                options,
                                initial: ['daily', 'monthly'],
                            },
                            {
                                type: 'segmented',
                                key: 'mode',
                                label: 'Mode',
                                options,
                                initial: 'yearly',
                            },
                            {
                                type: 'numberInput',
                                key: 'limit',
                                label: 'Limit',
                                min: 10,
                                max: 1,
                                initial: 20,
                            },
                        ],
                    }),
                ),
            ).toEqual([
                'blocks[0].initial: "hourly" is not one of the option values',
                'blocks[1].initial: "monthly" is not one of the option values',
                'blocks[2].initial: "yearly" is not one of the option values',
                'blocks[3]: min 10 is greater than max 1',
                'blocks[3].initial: is outside min..max',
            ]);
        });

        it('caps the total block count and the number of queries', () => {
            const dividers = Array.from({ length: 20 }, () => ({
                type: 'divider' as const,
            }));
            const queries = Object.fromEntries(
                Array.from({ length: 7 }, (_, index) => [
                    `query${index}`,
                    { operationId: 'GetExplores' },
                ]),
            );

            expect(
                problemsOf(
                    specWith({
                        queries,
                        blocks: [
                            { type: 'stack', children: dividers },
                            { type: 'group', children: dividers },
                        ],
                    }),
                ),
            ).toEqual([
                'blocks: 42 blocks in total; the limit is 40',
                'queries: 7 queries; the limit is 6',
            ]);
        });
    });
});
