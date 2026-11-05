import execa from 'execa';
import { runWithAgentConnectionSelection } from '../credentials';
import GlobalState from '../globalState';
import { diagnosticsHandler } from './diagnostics';

vi.mock('execa', () => ({ default: vi.fn().mockResolvedValue({ all: 'ok' }) }));
vi.mock('../config', () => ({ getConfig: vi.fn().mockResolvedValue({}) }));
vi.mock('../analytics/analytics', () => ({
    LightdashAnalytics: { track: vi.fn() },
}));
vi.mock('./dbt/apiClient', () => ({
    checkLightdashVersion: vi.fn(),
    getUserContext: vi.fn(),
}));
vi.mock('./dbt/getDbtVersion', () => ({
    getDbtVersion: vi.fn().mockResolvedValue({ verboseVersion: '1.9.0' }),
}));
beforeEach(() => {
    vi.stubEnv('LIGHTDASH_AGENT_CONNECTION', undefined);
    vi.mocked(execa).mockClear();
    vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    GlobalState.setVerbose(false);
});
it('keeps the exact ordinary debug spawn', async () => {
    await diagnosticsHandler({
        dbt: true,
        projectDir: '/project',
        profilesDir: '/profiles',
        defer: true,
        state: '/state',
    });
    expect(vi.mocked(execa).mock.calls).toEqual([
        [
            'dbt',
            [
                'debug',
                '--project-dir',
                '/project',
                '--profiles-dir',
                '/profiles',
                '--defer',
                '--state',
                '/state',
            ],
            { all: true, stdio: ['pipe', 'pipe', 'pipe'] },
        ],
    ]);
});
it('keeps diagnostics unavailable before any selected child starts', async () => {
    await expect(
        runWithAgentConnectionSelection('missing', () =>
            diagnosticsHandler({ dbt: true }),
        ),
    ).rejects.toThrow('not available with an agent connection');
    expect(execa).not.toHaveBeenCalled();
});
