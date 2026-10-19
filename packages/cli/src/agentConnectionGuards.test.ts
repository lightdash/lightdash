import { LightdashAnalytics } from './analytics/analytics';
import { getConfig } from './config';
import { agentCommandUnavailable, personalLoginRequired } from './credentials';
import { agentConnectHandler } from './handlers/agentConnect';
import { createAppHandler } from './handlers/apps/createApp';
import {
    appsPreviewHandler,
    buildPreviewChildEnv,
    fetchBrowserImageOrigins,
    preflightPreviewRequest,
} from './handlers/apps/preview';
import { startPreviewProxy } from './handlers/apps/previewProxy';
import { connectSnowflakeHandler } from './handlers/connectSnowflake';
import { createProject } from './handlers/createProject';
import { refreshHandler } from './handlers/dbt/refresh';
import { diagnosticsHandler } from './handlers/diagnostics';
import { uploadHandler } from './handlers/download';
import { exportChartImageHandler } from './handlers/exportChartImage';
import { listProjectsHandler } from './handlers/listProjects';
import { isApiKeyEnvVarShadowing, login } from './handlers/login';
import { generatePersonalAccessToken } from './handlers/login/pat';
import { loginWithOauth } from './handlers/oauthLogin';
import { preAggregateAuditHandler } from './handlers/preAggregateAudit';
import {
    previewHandler,
    startPreviewHandler,
    stopPreviewHandler,
} from './handlers/preview';
import { renameHandler } from './handlers/renameHandler';
import { renameProjectHandler } from './handlers/renameProject';
import {
    setFirstProject,
    setProjectCommand,
    setProjectHandler,
    unsetProjectHandler,
} from './handlers/setProject';
import { setWarehouseHandler } from './handlers/setWarehouse';
import { slugUpdateHandler } from './handlers/slugUpdate';
import { setSourceHandler } from './handlers/sourceSelection';
import { validateHandler } from './handlers/validate';

vi.mock('./config', async (importOriginal) => ({
    ...(await importOriginal<typeof import('./config')>()),
    getConfig: vi.fn(() => {
        throw new Error('Config must not be read');
    }),
}));
const invokeWithoutArguments = (handler: unknown): unknown =>
    (handler as (...args: unknown[]) => unknown)();
afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
});
it.each([
    ['list projects', listProjectsHandler, false],
    ['set project', setProjectHandler, false],
    ['set project helper', setProjectCommand, false],
    ['first project', setFirstProject, false],
    ['unset project', unsetProjectHandler, false],
    ['set source', setSourceHandler, false],
    ['rename project', renameProjectHandler, false],
    ['set warehouse', setWarehouseHandler, false],
    ['refresh', refreshHandler, false],
    ['validate', validateHandler, false],
    ['pre-aggregate audit', preAggregateAuditHandler, false],
    ['create project', createProject, false],
    ['login', login, true],
    ['login env warning', isApiKeyEnvVarShadowing, true],
    ['PAT', generatePersonalAccessToken, true],
    ['OAuth', loginWithOauth, true],
    ['agent connect', agentConnectHandler, true],
    ['connect-snowflake', connectSnowflakeHandler, false],
    ['export-chart-image', exportChartImageHandler, false],
    ['apps preview', appsPreviewHandler, false],
    ['preview child env', buildPreviewChildEnv, false],
    ['image origins', fetchBrowserImageOrigins, false],
    ['preview preflight', preflightPreviewRequest, false],
    ['preview proxy', startPreviewProxy, false],
    ['apps create', createAppHandler, false],
    ['upload', uploadHandler, false],
    ['rename', renameHandler, false],
    ['slug-update', slugUpdateHandler, false],
    ['preview', previewHandler, false],
    ['start-preview', startPreviewHandler, false],
    ['stop-preview', stopPreviewHandler, false],
    ['diagnostics', diagnosticsHandler, false],
])(
    'refuses direct %s before reading config or arguments',
    async (_name, handler, personal) => {
        vi.stubEnv('LIGHTDASH_AGENT_CONNECTION', 'selected');
        await expect(
            Promise.resolve().then(() => invokeWithoutArguments(handler)),
        ).rejects.toThrow(
            personal ? personalLoginRequired : agentCommandUnavailable,
        );
        expect(getConfig).not.toHaveBeenCalled();
    },
);
it('does not resolve a human analytics identity with a selection', async () => {
    vi.stubEnv('LIGHTDASH_AGENT_CONNECTION', 'selected');
    await LightdashAnalytics.identify({});
    expect(getConfig).not.toHaveBeenCalled();
});
