import {
    SupportedDbtAdapter,
    type Explore,
    type SemanticLayerDraft,
    type SemanticLayerDraftModel,
    type SemanticStudioWorkspace,
} from '@lightdash/common';

const exploreOf = (name: string, label: string): Explore => ({
    name,
    label,
    tags: [],
    baseTable: name,
    joinedTables: [],
    targetDatabase: SupportedDbtAdapter.POSTGRES,
    tables: {
        [name]: {
            name,
            label,
            database: 'db',
            schema: 'public',
            sqlTable: name,
            dimensions: {},
            metrics: {},
            lineageGraph: {},
        },
    },
});

export const draftModel = (
    model: string,
    contentBefore: string | null,
    contentAfter: string | null,
    label: string = model,
): SemanticLayerDraftModel => ({
    model,
    contentBefore,
    contentAfter,
    explore: contentAfter === null ? null : exploreOf(model, label),
    reconciliation: null,
    alsoChanging: [],
    publishedSince: null,
});

export const draftOf = (
    models: SemanticLayerDraftModel[],
): SemanticLayerDraft => ({
    changes: [],
    models,
    errors: [],
    settled: [],
    othersDrafting: [],
});

export const workspaceOf = (
    workspaceUuid: string,
    overrides: Partial<SemanticStudioWorkspace> = {},
): SemanticStudioWorkspace => ({
    workspaceUuid,
    projectUuid: 'project',
    name: `Change ${workspaceUuid}`,
    threadUuid: `thread-${workspaceUuid}`,
    agentUuid: null,
    owner: { userUuid: 'me', name: 'Me' },
    isMine: true,
    isActive: false,
    pullRequest: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    finishedAt: null,
    publishedLive: false,
    ...overrides,
});
