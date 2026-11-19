import {
    ForbiddenError,
    NotFoundError,
    ParameterError,
    type AiAgent,
    type AiPromptContextInput,
    type SessionUser,
} from '@lightdash/common';
import { AiAgentService } from './AiAgentService';

vi.mock('../ai/AiAgentMcpRuntimeClient', () => ({
    AiAgentMcpRuntimeClient: vi
        .fn()
        // eslint-disable-next-line prefer-arrow-callback
        .mockImplementation(function MockAiAgentMcpRuntimeClient() {
            return {};
        }),
}));

const PROJECT_UUID = 'project-uuid';
const USER_UUID = 'user-uuid';

const user = {
    userUuid: USER_UUID,
    organizationUuid: 'org-uuid',
    ability: {},
    abilityRules: [],
} as unknown as SessionUser;
const agent = {
    uuid: 'agent-uuid',
    organizationUuid: 'org-uuid',
    projectUuid: PROJECT_UUID,
} as AiAgent;

type App = {
    app_id: string;
    project_uuid: string;
    space_uuid: string | null;
    created_by_user_uuid: string;
    template: string | null;
    organization_uuid: string;
};

const sharedApp: App = {
    app_id: 'app-shared',
    project_uuid: PROJECT_UUID,
    space_uuid: 'space-1',
    created_by_user_uuid: 'someone-else',
    template: 'dashboard',
    organization_uuid: 'org-uuid',
};

const otherUsersPersonalApp: App = {
    ...sharedApp,
    app_id: 'app-personal',
    space_uuid: null,
};

const chartTypeApp: App = {
    ...sharedApp,
    app_id: 'app-viz',
    template: 'data_app_viz',
};

type Design = { designUuid: string; organizationUuid: string };

type Doc = { documentUuid: string; spaceUuid: string };
type SqlChart = { savedSqlUuid: string; spaceUuid: string };
type ComposerChart = { uuid: string; projectUuid: string };
type ThreadFile = {
    uuid: string;
    ownerUuid: string;
    threadUuid: string | null;
};

const buildService = (
    apps: App[],
    designs: Design[] = [],
    {
        documents = [],
        documentsEnabled = true,
        threadFiles = [],
        sqlCharts = [],
        composerCharts = [],
        composerChartsEnabled = true,
    }: {
        documents?: Doc[];
        documentsEnabled?: boolean;
        threadFiles?: ThreadFile[];
        sqlCharts?: SqlChart[];
        composerCharts?: ComposerChart[];
        composerChartsEnabled?: boolean;
    } = {},
) => {
    // Mirrors the model predicate: own, unclaimed files in the org.
    const aiThreadFileModel = {
        findClaimableByUser: vi
            .fn()
            .mockImplementation(
                async (args: { fileUuids: string[]; userUuid: string }) =>
                    threadFiles
                        .filter(
                            (f) =>
                                args.fileUuids.includes(f.uuid) &&
                                f.ownerUuid === args.userUuid &&
                                f.threadUuid === null,
                        )
                        .map((f) => ({ uuid: f.uuid })),
            ),
        findForThread: vi.fn(),
    };
    const documentService = {
        get: vi
            .fn()
            .mockImplementation(
                async (
                    _account: unknown,
                    _projectUuid: string,
                    documentUuid: string,
                ) => {
                    const document = documents.find(
                        (d) => d.documentUuid === documentUuid,
                    );
                    if (!document)
                        throw new NotFoundError('Document not found');
                    return document;
                },
            ),
    };
    const savedSqlService = {
        getSqlChart: vi
            .fn()
            .mockImplementation(
                async (
                    _user: SessionUser,
                    _projectUuid: string,
                    savedSqlUuid: string,
                ) => {
                    const chart = sqlCharts.find(
                        (c) => c.savedSqlUuid === savedSqlUuid,
                    );
                    if (!chart)
                        throw new NotFoundError('Saved SQL Chart not found');
                    return { savedSqlUuid, space: { uuid: chart.spaceUuid } };
                },
            ),
    };
    const composerChartService = {
        isEnabled: vi.fn().mockResolvedValue(composerChartsEnabled),
        get: vi
            .fn()
            .mockImplementation(
                async (
                    _account: unknown,
                    projectUuid: string,
                    composerChartUuid: string,
                ) => {
                    const chart = composerCharts.find(
                        (c) =>
                            c.uuid === composerChartUuid &&
                            c.projectUuid === projectUuid,
                    );
                    if (!chart)
                        throw new NotFoundError('Composer chart not found');
                    return chart;
                },
            ),
    };
    const featureFlagService = {
        get: vi.fn().mockResolvedValue({ enabled: documentsEnabled }),
    };
    const organizationDesignModel = {
        findInOrganization: vi
            .fn()
            .mockImplementation(
                async (organizationUuid: string, designUuid: string) =>
                    designs.find(
                        (d) =>
                            d.designUuid === designUuid &&
                            d.organizationUuid === organizationUuid,
                    ),
            ),
    };
    const appModel = {
        findAppByUuid: vi
            .fn()
            .mockImplementation(async (appUuid: string) =>
                apps.find((a) => a.app_id === appUuid),
            ),
    };
    // Personal apps (no space) are viewable only by their creator.
    const appGenerateService = {
        canViewApp: vi
            .fn()
            .mockImplementation(
                async (u: SessionUser, app: App) =>
                    app.space_uuid !== null ||
                    app.created_by_user_uuid === u.userUuid,
            ),
    };
    const service = new AiAgentService({
        appModel,
        appGenerateService,
        organizationDesignModel,
        documentService,
        savedSqlService,
        composerChartService,
        featureFlagService,
        aiThreadFileModel,
        analytics: { track: vi.fn() },
        lightdashConfig: { ai: { copilot: {} } },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const validate = (
        context: AiPromptContextInput,
        allowedSpaceUuids?: string[],
    ) =>
        (
            service as unknown as {
                validatePromptContextAccess: (
                    u: SessionUser,
                    a: AiAgent,
                    c: AiPromptContextInput,
                    s?: string[],
                ) => Promise<AiPromptContextInput | undefined>;
            }
        ).validatePromptContextAccess(user, agent, context, allowedSpaceUuids);
    return {
        validate,
        appModel,
        appGenerateService,
        organizationDesignModel,
        documentService,
        savedSqlService,
        composerChartService,
        aiThreadFileModel,
    };
};

describe('validatePromptContextAccess for data apps', () => {
    it('accepts a data app the user can view', async () => {
        const { validate } = buildService([sharedApp]);
        const context: AiPromptContextInput = [
            { type: 'data_app', appUuid: 'app-shared', appSlug: 'shared' },
        ];

        await expect(validate(context)).resolves.toEqual(context);
    });

    it("rejects another user's personal app", async () => {
        const { validate } = buildService([otherUsersPersonalApp]);

        await expect(
            validate([{ type: 'data_app', appUuid: 'app-personal' }]),
        ).rejects.toThrow(ForbiddenError);
    });

    it('rejects a project chart type', async () => {
        const { validate, appGenerateService } = buildService([chartTypeApp]);

        const result = validate([{ type: 'data_app', appUuid: 'app-viz' }]);
        await expect(result).rejects.toThrow(ParameterError);
        await expect(result).rejects.toThrow(
            'Project chart types cannot be pinned context',
        );
        expect(appGenerateService.canViewApp).not.toHaveBeenCalled();
    });

    it('rejects an app from another project as not found', async () => {
        const { validate } = buildService([
            { ...sharedApp, project_uuid: 'other-project' },
        ]);

        await expect(
            validate([{ type: 'data_app', appUuid: 'app-shared' }]),
        ).rejects.toThrow(NotFoundError);
    });

    it('collapses the same app pinned twice into one item', async () => {
        const { validate, appModel } = buildService([sharedApp]);

        await expect(
            validate([
                { type: 'data_app', appUuid: 'app-shared', appSlug: 'shared' },
                { type: 'data_app', appUuid: 'app-shared' },
            ]),
        ).resolves.toEqual([
            { type: 'data_app', appUuid: 'app-shared', appSlug: 'shared' },
        ]);
        expect(appModel.findAppByUuid).toHaveBeenCalledTimes(1);
    });
});

describe('validatePromptContextAccess for themes', () => {
    const orgTheme: Design = {
        designUuid: 'design-org',
        organizationUuid: 'org-uuid',
    };
    const foreignTheme: Design = {
        designUuid: 'design-foreign',
        organizationUuid: 'other-org',
    };

    it("accepts a theme from the agent's organization", async () => {
        const { validate, organizationDesignModel } = buildService(
            [],
            [orgTheme],
        );
        const context: AiPromptContextInput = [
            { type: 'design', designUuid: 'design-org' },
        ];

        await expect(validate(context)).resolves.toEqual(context);
        expect(organizationDesignModel.findInOrganization).toHaveBeenCalledWith(
            'org-uuid',
            'design-org',
        );
    });

    it('rejects a theme outside the organization as not found', async () => {
        const { validate } = buildService([], [foreignTheme]);

        await expect(
            validate([{ type: 'design', designUuid: 'design-foreign' }]),
        ).rejects.toThrow(NotFoundError);
    });

    it('collapses the same theme pinned twice into one item', async () => {
        const { validate } = buildService([], [orgTheme]);

        await expect(
            validate([
                { type: 'design', designUuid: 'design-org' },
                { type: 'design', designUuid: 'design-org' },
            ]),
        ).resolves.toEqual([{ type: 'design', designUuid: 'design-org' }]);
    });
});

describe('validatePromptContextAccess for Documents', () => {
    const document: Doc = { documentUuid: 'doc-uuid', spaceUuid: 'space-1' };

    it('accepts a Document the user can view, checked in the agent project', async () => {
        const { validate, documentService } = buildService([], [], {
            documents: [document],
        });
        const context: AiPromptContextInput = [
            { type: 'document', documentUuid: 'doc-uuid', documentSlug: 'q3' },
        ];

        await expect(validate(context)).resolves.toEqual(context);
        expect(documentService.get).toHaveBeenCalledWith(
            expect.anything(),
            PROJECT_UUID,
            'doc-uuid',
        );
    });

    it('rejects a Document the user cannot view', async () => {
        const { validate } = buildService([], [], { documents: [] });

        await expect(
            validate([{ type: 'document', documentUuid: 'doc-uuid' }]),
        ).rejects.toThrow(NotFoundError);
    });

    it('rejects a Document outside the embedded space', async () => {
        const { validate } = buildService([], [], { documents: [document] });

        await expect(
            validate(
                [{ type: 'document', documentUuid: 'doc-uuid' }],
                ['space-2'],
            ),
        ).rejects.toThrow('Pinned Document is outside the embedded space');
    });

    it('collapses the same Document pinned twice into one item', async () => {
        const { validate, documentService } = buildService([], [], {
            documents: [document],
        });

        await expect(
            validate([
                { type: 'document', documentUuid: 'doc-uuid' },
                {
                    type: 'document',
                    documentUuid: 'doc-uuid',
                    documentSlug: 'q3',
                },
            ]),
        ).resolves.toEqual([{ type: 'document', documentUuid: 'doc-uuid' }]);
        expect(documentService.get).toHaveBeenCalledTimes(1);
    });
});

describe('validatePromptContextAccess for attached documents', () => {
    const ownFile: ThreadFile = {
        uuid: 'file-own',
        ownerUuid: USER_UUID,
        threadUuid: null,
    };

    it('accepts an unclaimed file the user uploaded', async () => {
        const { validate } = buildService([], [], { threadFiles: [ownFile] });
        await expect(
            validate([{ type: 'thread_file', fileUuid: 'file-own' }]),
        ).resolves.toEqual([{ type: 'thread_file', fileUuid: 'file-own' }]);
    });

    it('collapses the same file attached twice into one item', async () => {
        const { validate, aiThreadFileModel } = buildService([], [], {
            threadFiles: [ownFile],
        });
        await expect(
            validate([
                { type: 'thread_file', fileUuid: 'file-own' },
                { type: 'thread_file', fileUuid: 'file-own' },
            ]),
        ).resolves.toHaveLength(1);
        expect(aiThreadFileModel.findClaimableByUser).toHaveBeenCalledWith(
            expect.objectContaining({ fileUuids: ['file-own'] }),
        );
    });

    it("rejects another user's file with the generic error", async () => {
        const { validate } = buildService([], [], {
            threadFiles: [
                {
                    uuid: 'file-theirs',
                    ownerUuid: 'someone-else',
                    threadUuid: null,
                },
            ],
        });
        await expect(
            validate([{ type: 'thread_file', fileUuid: 'file-theirs' }]),
        ).rejects.toThrow(ParameterError);
    });

    it('rejects a file already sent in a thread with the same error', async () => {
        const { validate } = buildService([], [], {
            threadFiles: [{ ...ownFile, threadUuid: 'thread-1' }],
        });
        await expect(
            validate([{ type: 'thread_file', fileUuid: 'file-own' }]),
        ).rejects.toThrow(ParameterError);
    });

    it('rejects attached documents in embedded AI', async () => {
        const { validate } = buildService([], [], { threadFiles: [ownFile] });
        await expect(
            validate(
                [{ type: 'thread_file', fileUuid: 'file-own' }],
                ['space-1'],
            ),
        ).rejects.toThrow(ForbiddenError);
    });
});

describe('validatePromptContextAccess for SQL charts', () => {
    const sqlChart: SqlChart = {
        savedSqlUuid: 'sql-uuid',
        spaceUuid: 'space-1',
    };
    const item = {
        type: 'sql_chart',
        sqlChartUuid: 'sql-uuid',
        sqlChartSlug: 'revenue-sql',
    } as const;

    it('accepts a SQL chart the user can view, checked in the agent project', async () => {
        const { validate, savedSqlService } = buildService([], [], {
            sqlCharts: [sqlChart],
        });

        await expect(validate([item])).resolves.toEqual([item]);
        expect(savedSqlService.getSqlChart).toHaveBeenCalledWith(
            user,
            PROJECT_UUID,
            'sql-uuid',
        );
    });

    it('rejects a SQL chart the user cannot view', async () => {
        const { validate } = buildService([], [], { sqlCharts: [] });

        await expect(validate([item])).rejects.toThrow(NotFoundError);
    });

    it('rejects a SQL chart outside the embedded space', async () => {
        const { validate } = buildService([], [], { sqlCharts: [sqlChart] });

        await expect(validate([item], ['space-2'])).rejects.toThrow(
            'Pinned SQL chart is outside the embedded space',
        );
    });
});

describe('validatePromptContextAccess for composer charts', () => {
    const composerChart: ComposerChart = {
        uuid: 'composer-uuid',
        projectUuid: PROJECT_UUID,
    };
    const item = {
        type: 'composer_chart',
        composerChartUuid: 'composer-uuid',
        composerChartSlug: 'revenue-vs-target',
    } as const;

    it('accepts a composer chart the user can view, checked in the agent project', async () => {
        const { validate, composerChartService } = buildService([], [], {
            composerCharts: [composerChart],
        });

        await expect(validate([item])).resolves.toEqual([item]);
        expect(composerChartService.get).toHaveBeenCalledWith(
            expect.objectContaining({
                user: expect.objectContaining({ userUuid: USER_UUID }),
            }),
            PROJECT_UUID,
            'composer-uuid',
        );
    });

    it('rejects a composer chart the user cannot view', async () => {
        const { validate } = buildService([], [], { composerCharts: [] });

        await expect(validate([item])).rejects.toThrow(NotFoundError);
    });

    it('rejects a composer chart when composer charts are off', async () => {
        const { validate } = buildService([], [], {
            composerCharts: [composerChart],
            composerChartsEnabled: false,
        });

        await expect(validate([item])).rejects.toThrow(NotFoundError);
    });

    it('rejects a composer chart in embedded AI', async () => {
        const { validate } = buildService([], [], {
            composerCharts: [composerChart],
        });

        await expect(validate([item], ['space-1'])).rejects.toThrow(
            'Composer charts are not available in embedded AI',
        );
    });
});
