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
import { diagnosticsHandler } from './handlers/diagnostics';
import { downloadHandler, uploadHandler } from './handlers/download';
import { exportChartImageHandler } from './handlers/exportChartImage';
import { isApiKeyEnvVarShadowing, login } from './handlers/login';
import { generatePersonalAccessToken } from './handlers/login/pat';
import { loginWithOauth } from './handlers/oauthLogin';
import { renameHandler } from './handlers/renameHandler';
import { slugUpdateHandler } from './handlers/slugUpdate';

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
    ['download', downloadHandler, false],
    ['upload', uploadHandler, false],
    ['rename', renameHandler, false],
    ['slug-update', slugUpdateHandler, false],
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
