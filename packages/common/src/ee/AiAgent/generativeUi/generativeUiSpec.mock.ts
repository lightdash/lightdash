import {
    type GenerativeUiActionOutcome,
    type GenerativeUiActionSubmission,
    type GenerativeUiSpec,
} from '../schemas/tools/toolGenerateUiArgs';
import { type GenerativeUiOperation } from './compileGenerativeUiSpec';

export const GENERATIVE_UI_PROJECT_UUID_MOCK =
    '3675b69e-8324-4110-bdca-059031aa8da3';

// Rows copied from the generated OpenAPI spec for every allowlisted operation.
export const generativeUiOperationsMock: GenerativeUiOperation[] = [
    {
        operationId: 'ListSpacesInProject',
        method: 'GET',
        pathTemplate: '/api/v1/projects/{projectUuid}/spaces',
    },
    {
        operationId: 'GetSpace',
        method: 'GET',
        pathTemplate: '/api/v1/projects/{projectUuid}/spaces/{spaceUuid}',
    },
    {
        operationId: 'GetSpaceDeleteImpact',
        method: 'GET',
        pathTemplate:
            '/api/v1/projects/{projectUuid}/spaces/{spaceUuid}/delete-impact',
    },
    {
        operationId: 'ListChartSummariesInProject',
        method: 'GET',
        pathTemplate: '/api/v1/projects/{projectUuid}/chart-summaries',
    },
    {
        operationId: 'ListChartsInProject',
        method: 'GET',
        pathTemplate: '/api/v1/projects/{projectUuid}/charts',
    },
    {
        operationId: 'getDashboards',
        method: 'GET',
        pathTemplate: '/api/v1/projects/{projectUuid}/dashboards',
    },
    {
        operationId: 'GetExplores',
        method: 'GET',
        pathTemplate: '/api/v1/projects/{projectUuid}/explores',
    },
    {
        operationId: 'getPinnedItems',
        method: 'GET',
        pathTemplate:
            '/api/v1/projects/{projectUuid}/pinned-lists/{pinnedListUuid}/items',
    },
    {
        operationId: 'getFavorites',
        method: 'GET',
        pathTemplate: '/api/v1/projects/{projectUuid}/favorites',
    },
    {
        operationId: 'ListSchedulers',
        method: 'GET',
        pathTemplate: '/api/v1/schedulers/{projectUuid}/list',
    },
    {
        operationId: 'getDashboardSchedulers',
        method: 'GET',
        pathTemplate: '/api/v2/dashboards/{dashboardUuid}/schedulers',
    },
    {
        operationId: 'GetAuthenticatedUser',
        method: 'GET',
        pathTemplate: '/api/v1/user',
    },
    {
        operationId: 'CreateSpaceInProject',
        method: 'POST',
        pathTemplate: '/api/v1/projects/{projectUuid}/spaces',
    },
    {
        operationId: 'UpdateSpace',
        method: 'PATCH',
        pathTemplate: '/api/v1/projects/{projectUuid}/spaces/{spaceUuid}',
    },
    {
        operationId: 'DeleteSpace',
        method: 'DELETE',
        pathTemplate: '/api/v1/projects/{projectUuid}/spaces/{spaceUuid}',
    },
    {
        operationId: 'Move content',
        method: 'POST',
        pathTemplate: '/api/v2/content/{projectUuid}/move',
    },
    {
        operationId: 'updateDashboards',
        method: 'PATCH',
        pathTemplate: '/api/v1/projects/{projectUuid}/dashboards',
    },
    {
        operationId: 'toggleFavorite',
        method: 'PATCH',
        pathTemplate: '/api/v1/projects/{projectUuid}/favorites',
    },
    {
        operationId: 'updatePinnedItemsOrder',
        method: 'PATCH',
        pathTemplate:
            '/api/v1/projects/{projectUuid}/pinned-lists/{pinnedListUuid}/items/order',
    },
    {
        operationId: 'createDashboardScheduler',
        method: 'POST',
        pathTemplate: '/api/v1/dashboards/{dashboardUuidOrSlug}/schedulers',
    },
    {
        operationId: 'createSavedChartScheduler',
        method: 'POST',
        pathTemplate: '/api/v1/saved/{chartUuid}/schedulers',
    },
    {
        operationId: 'updateScheduler',
        method: 'PATCH',
        pathTemplate: '/api/v1/schedulers/{schedulerUuid}',
    },
    {
        operationId: 'deleteScheduler',
        method: 'DELETE',
        pathTemplate: '/api/v1/schedulers/{schedulerUuid}',
    },
    {
        operationId: 'createComment',
        method: 'POST',
        pathTemplate:
            '/api/v1/comments/dashboards/{dashboardUuid}/{dashboardTileUuid}',
    },
    {
        operationId: 'deleteComment',
        method: 'DELETE',
        pathTemplate: '/api/v1/comments/dashboards/{dashboardUuid}/{commentId}',
    },
    {
        operationId: 'ValidateProject',
        method: 'POST',
        pathTemplate: '/api/v1/projects/{projectUuid}/validate',
    },
];

export const generativeUiOperationsByIdMock: ReadonlyMap<
    string,
    GenerativeUiOperation
> = new Map(
    generativeUiOperationsMock.map((operation) => [
        operation.operationId,
        operation,
    ]),
);

/** The demo: pick a space and some charts, then move each chart there. */
export const moveChartsSpecMock: GenerativeUiSpec = {
    version: 1,
    title: 'Move charts to a space',
    queries: {
        spaces: { operationId: 'ListSpacesInProject' },
        charts: { operationId: 'ListChartSummariesInProject' },
    },
    blocks: [
        {
            type: 'select',
            key: 'spaceUuid',
            label: 'Target space',
            required: true,
            searchable: true,
            options: { $query: 'spaces', label: 'name', value: 'uuid' },
        },
        {
            type: 'table',
            rows: { $query: 'charts' },
            columns: [
                { key: 'name', label: 'Chart' },
                { key: 'spaceName', label: 'Space' },
            ],
            selectable: { key: 'chartUuids', rowKey: 'uuid', multiple: true },
        },
    ],
    action: {
        label: 'Move charts',
        steps: [
            {
                id: 'move',
                operationId: 'Move content',
                forEach: { $state: 'chartUuids' },
                params: {
                    body: {
                        action: {
                            type: 'move',
                            targetSpaceUuid: { $state: 'spaceUuid' },
                        },
                        item: {
                            contentType: 'chart',
                            source: 'dbt_explore',
                            uuid: { $item: '' },
                        },
                    },
                },
            },
        ],
        successMessage: 'Charts moved.',
    },
};

/** Every block type, with containers nested to the maximum depth. */
export const everyBlockSpecMock: GenerativeUiSpec = {
    version: 1,
    title: 'Create a space',
    description: 'Every block type the card can render.',
    queries: {
        spaces: { operationId: 'ListSpacesInProject' },
        explores: { operationId: 'GetExplores' },
    },
    blocks: [
        { type: 'heading', text: 'New space' },
        {
            type: 'text',
            text: 'The space is created in this project.',
            variant: 'dimmed',
        },
        {
            type: 'callout',
            variant: 'info',
            text: 'You can move content into it later.',
        },
        {
            type: 'stack',
            gap: 'sm',
            children: [
                {
                    type: 'group',
                    grow: true,
                    children: [
                        {
                            type: 'stack',
                            children: [
                                {
                                    type: 'textInput',
                                    key: 'name',
                                    label: 'Name',
                                    placeholder: 'Finance',
                                    required: true,
                                },
                                {
                                    type: 'numberInput',
                                    key: 'order',
                                    label: 'Order',
                                    initial: 1,
                                    min: 0,
                                    max: 10,
                                },
                            ],
                        },
                        {
                            type: 'stack',
                            children: [
                                {
                                    type: 'dateInput',
                                    key: 'reviewOn',
                                    label: 'Review on',
                                    initial: '2026-10-01',
                                },
                                {
                                    type: 'checkbox',
                                    key: 'nested',
                                    label: 'Nest under another space',
                                    initial: false,
                                },
                            ],
                        },
                    ],
                },
            ],
        },
        {
            type: 'select',
            key: 'parentSpaceUuid',
            label: 'Parent space',
            options: { $query: 'spaces', label: 'name', value: 'uuid' },
            visibleWhen: { $state: 'nested', equals: true },
        },
        { type: 'divider' },
        {
            type: 'textarea',
            key: 'notes',
            label: 'Notes',
            placeholder: 'Why this space exists',
        },
        {
            type: 'segmented',
            key: 'access',
            label: 'Access',
            options: [
                { label: 'Inherit', value: 'inherit' },
                { label: 'Private', value: 'private' },
            ],
            initial: 'inherit',
        },
        {
            type: 'multiSelect',
            key: 'tags',
            label: 'Tags',
            options: [
                { label: 'Finance', value: 'finance' },
                { label: 'Weekly', value: 'weekly' },
            ],
            initial: ['finance'],
        },
        {
            type: 'table',
            rows: { $query: 'explores' },
            columns: [
                { key: 'label', label: 'Explore' },
                { key: 'groupLabel', label: 'Group' },
            ],
        },
    ],
    action: {
        label: 'Create space',
        steps: [
            {
                id: 'createSpace',
                operationId: 'CreateSpaceInProject',
                params: {
                    body: {
                        name: { $state: 'name' },
                        parentSpaceUuid: { $state: 'parentSpaceUuid' },
                    },
                },
            },
        ],
        successMessage: 'Space created.',
    },
};

/** A query that depends on an input: the schedulers of the chosen dashboard. */
export const dependentQuerySpecMock: GenerativeUiSpec = {
    version: 1,
    title: 'Rename a dashboard schedule',
    queries: {
        dashboards: { operationId: 'getDashboards' },
        schedulers: {
            operationId: 'getDashboardSchedulers',
            params: { path: { dashboardUuid: { $state: 'dashboardUuid' } } },
        },
    },
    blocks: [
        {
            type: 'select',
            key: 'dashboardUuid',
            label: 'Dashboard',
            required: true,
            options: { $query: 'dashboards', label: 'name', value: 'uuid' },
        },
        {
            type: 'table',
            rows: { $query: 'schedulers', path: 'data' },
            columns: [
                { key: 'name', label: 'Schedule' },
                { key: 'cron', label: 'Cron' },
            ],
            selectable: {
                key: 'schedulerUuid',
                rowKey: 'schedulerUuid',
                multiple: false,
            },
        },
        {
            type: 'textInput',
            key: 'name',
            label: 'New name',
            required: true,
        },
    ],
    action: {
        label: 'Rename schedule',
        steps: [
            {
                id: 'rename',
                operationId: 'updateScheduler',
                params: {
                    path: { schedulerUuid: { $state: 'schedulerUuid' } },
                    body: { name: { $state: 'name' } },
                },
            },
        ],
    },
};

/** A chain: create a space, then move each selected chart into it. */
export const forEachChainSpecMock: GenerativeUiSpec = {
    version: 1,
    title: 'Move charts to a new space',
    queries: {
        charts: { operationId: 'ListChartSummariesInProject' },
    },
    blocks: [
        {
            type: 'textInput',
            key: 'spaceName',
            label: 'Space name',
            required: true,
        },
        {
            type: 'table',
            rows: { $query: 'charts' },
            columns: [{ key: 'name', label: 'Chart' }],
            selectable: { key: 'chartUuids', rowKey: 'uuid', multiple: true },
        },
    ],
    action: {
        label: 'Create and move',
        steps: [
            {
                id: 'createSpace',
                operationId: 'CreateSpaceInProject',
                params: { body: { name: { $state: 'spaceName' } } },
            },
            {
                id: 'move',
                operationId: 'Move content',
                forEach: { $state: 'chartUuids' },
                params: {
                    body: {
                        action: {
                            type: 'move',
                            targetSpaceUuid: {
                                $result: 'createSpace',
                                path: 'uuid',
                            },
                        },
                        item: {
                            contentType: 'chart',
                            source: 'dbt_explore',
                            uuid: { $item: '' },
                        },
                    },
                },
            },
        ],
        successMessage: 'Space created and charts moved.',
    },
};

/** A DELETE step, which needs a confirmation. */
export const deleteWithConfirmSpecMock: GenerativeUiSpec = {
    version: 1,
    title: 'Delete a space',
    queries: {
        spaces: { operationId: 'ListSpacesInProject' },
    },
    blocks: [
        {
            type: 'callout',
            variant: 'danger',
            text: 'Deleting a space also deletes its charts and dashboards.',
        },
        {
            type: 'select',
            key: 'spaceUuid',
            label: 'Space',
            required: true,
            options: { $query: 'spaces', label: 'name', value: 'uuid' },
        },
    ],
    action: {
        label: 'Delete space',
        confirm: 'Delete this space and everything in it?',
        steps: [
            {
                id: 'deleteSpace',
                operationId: 'DeleteSpace',
                params: { path: { spaceUuid: { $state: 'spaceUuid' } } },
            },
        ],
        successMessage: 'Space deleted.',
    },
};

/** Literal rows the agent already found, offered for selection. */
export const staticRowsSpecMock: GenerativeUiSpec = {
    version: 1,
    title: 'Favorite these charts',
    blocks: [
        {
            type: 'table',
            rows: [
                {
                    uuid: 'b3c4a0b8-3a4f-4a8e-9a53-6c2f0c1d8e11',
                    name: 'Revenue by month',
                    views: 120,
                },
                {
                    uuid: 'f2a6d9e1-7c55-4e0b-8a9f-2d4b1c3e5a70',
                    name: 'Revenue by region',
                    views: 45,
                },
            ],
            columns: [
                { key: 'name', label: 'Chart' },
                { key: 'views', label: 'Views' },
            ],
            selectable: { key: 'chartUuids', rowKey: 'uuid', multiple: true },
        },
    ],
    action: {
        label: 'Add to favorites',
        steps: [
            {
                id: 'favorite',
                operationId: 'toggleFavorite',
                forEach: { $state: 'chartUuids' },
                params: {
                    body: { contentUuid: { $item: '' }, contentType: 'chart' },
                },
            },
        ],
    },
};

/** Schema-valid but rejected by the compiler (unknown operation, projectUuid set). */
export const invalidSpecMock: GenerativeUiSpec = {
    version: 1,
    title: 'Rename a chart',
    blocks: [{ type: 'textInput', key: 'name', label: 'Name' }],
    action: {
        label: 'Rename',
        steps: [
            {
                id: 'rename',
                operationId: 'updateSavedChart',
                params: {
                    path: { projectUuid: GENERATIVE_UI_PROJECT_UUID_MOCK },
                    body: { name: { $state: 'name' } },
                },
            },
        ],
    },
};

const moveChartsStateMock = {
    spaceUuid: '0b9d2a8c-1f6e-4c3b-9d7a-5e2f8a1c4b60',
    chartUuids: [
        'b3c4a0b8-3a4f-4a8e-9a53-6c2f0c1d8e11',
        'f2a6d9e1-7c55-4e0b-8a9f-2d4b1c3e5a70',
    ],
};

const moveContentRequestMock = {
    operationId: 'Move content',
    method: 'POST',
    pathTemplate: '/api/v2/content/{projectUuid}/move',
} satisfies GenerativeUiOperation;

export const moveChartsSubmissionsMock = {
    success: {
        status: 'success',
        state: moveChartsStateMock,
        responses: { move: [null, null] },
    },
    failed: {
        status: 'failed',
        state: moveChartsStateMock,
        responses: { move: [null] },
        failure: {
            stepId: 'move',
            itemIndex: 1,
            error: {
                statusCode: 403,
                name: 'ForbiddenError',
                message: "You don't have access to this chart",
            },
        },
    },
    dismissed: { status: 'dismissed', state: moveChartsStateMock },
} satisfies Record<
    GenerativeUiActionSubmission['status'],
    GenerativeUiActionSubmission
>;

export const moveChartsOutcomesMock = {
    success: {
        status: 'success',
        state: moveChartsStateMock,
        steps: {
            move: {
                request: moveContentRequestMock,
                responses: [null, null],
                truncated: false,
            },
        },
    },
    failed: {
        status: 'failed',
        state: moveChartsStateMock,
        completed: {
            move: {
                request: moveContentRequestMock,
                responses: [null],
                truncated: false,
            },
        },
        failedStep: {
            id: 'move',
            itemIndex: 1,
            request: moveContentRequestMock,
            error: {
                statusCode: 403,
                name: 'ForbiddenError',
                message: "You don't have access to this chart",
            },
        },
    },
    dismissed: { status: 'dismissed', state: moveChartsStateMock },
} satisfies Record<
    GenerativeUiActionOutcome['status'],
    GenerativeUiActionOutcome
>;
