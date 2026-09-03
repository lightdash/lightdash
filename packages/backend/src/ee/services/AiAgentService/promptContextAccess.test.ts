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

const user = { userUuid: USER_UUID } as SessionUser;
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

const buildService = (apps: App[]) => {
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
        analytics: { track: vi.fn() },
        lightdashConfig: { ai: { copilot: {} } },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const validate = (context: AiPromptContextInput) =>
        (
            service as unknown as {
                validatePromptContextAccess: (
                    u: SessionUser,
                    a: AiAgent,
                    c: AiPromptContextInput,
                ) => Promise<AiPromptContextInput | undefined>;
            }
        ).validatePromptContextAccess(user, agent, context);
    return { validate, appModel, appGenerateService };
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
