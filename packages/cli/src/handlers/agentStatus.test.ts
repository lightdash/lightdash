import {
    AiAccessRefusalAction,
    AiAccessRefusalReason,
    ParameterError,
} from '@lightdash/common';
import { getConfig } from '../config';
import {
    agentAccess,
    agentConnectUrl,
    agentProjectUuid,
    connectedAgentAccess,
} from './agentAccess.mock';
import { agentStatusHandler } from './agentStatus';
import { lightdashApi } from './dbt/apiClient';
import { openBrowser } from './login/oauth';

vi.mock('../config', () => ({ getConfig: vi.fn() }));
vi.mock('./dbt/apiClient', () => ({ lightdashApi: vi.fn() }));
vi.mock('./login/oauth', () => ({ openBrowser: vi.fn() }));

const originalExitCode = process.exitCode;

beforeEach(() => {
    process.exitCode = undefined;
    vi.mocked(getConfig).mockResolvedValue({
        context: { project: agentProjectUuid },
    });
    vi.mocked(lightdashApi).mockResolvedValue(agentAccess);
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    process.exitCode = originalExitCode;
    vi.resetAllMocks();
    vi.restoreAllMocks();
});

describe('agent status', () => {
    it('reports a connected person', async () => {
        vi.mocked(lightdashApi).mockResolvedValue(connectedAgentAccess);
        await agentStatusHandler({ verbose: false });
        expect(console.error).toHaveBeenCalledExactlyOnceWith(
            'Agent connected',
        );
        expect(process.exitCode ?? 0).toBe(0);
        expect(lightdashApi).toHaveBeenCalledWith({
            method: 'GET',
            url: `/api/v2/projects/${agentProjectUuid}/ai-access/me`,
            body: undefined,
        });
        expect(openBrowser).not.toHaveBeenCalled();
    });

    it('reports the optional expiry as an ISO date', async () => {
        vi.mocked(lightdashApi).mockResolvedValue({
            ...connectedAgentAccess,
            expiresAt: '2026-10-08T10:00:00+01:00',
        });
        await agentStatusHandler({ verbose: false });
        expect(console.error).toHaveBeenCalledExactlyOnceWith(
            'Agent connected, expires 2026-10-08T09:00:00.000Z',
        );
    });

    it.each([null, 123, 'invalid'])(
        'ignores a malformed expiry: %s',
        async (expiresAt) => {
            vi.mocked(lightdashApi).mockResolvedValue({
                ...connectedAgentAccess,
                expiresAt,
            });
            await agentStatusHandler({ verbose: false });
            expect(console.error).toHaveBeenCalledExactlyOnceWith(
                'Agent connected',
            );
        },
    );

    it('reports sign-in and its link', async () => {
        await agentStatusHandler({ verbose: false });
        expect(vi.mocked(console.error).mock.calls).toEqual([
            [`Agent not connected: ${agentAccess.refusal!.message}`],
            [agentConnectUrl],
        ]);
        expect(process.exitCode).toBe(1);
    });

    it('reports when connection is not required', async () => {
        vi.mocked(lightdashApi).mockResolvedValue({
            ...agentAccess,
            requirementSource: null,
            refusal: null,
        });
        await agentStatusHandler({ verbose: false });
        expect(console.error).toHaveBeenCalledExactlyOnceWith(
            'Agent connection not required for this project',
        );
        expect(process.exitCode ?? 0).toBe(0);
    });

    it('reports other refusals without a connection link', async () => {
        vi.mocked(lightdashApi).mockResolvedValue({
            ...agentAccess,
            refusal: {
                ...agentAccess.refusal!,
                reason: AiAccessRefusalReason.PRINCIPAL_FAILED,
                action: AiAccessRefusalAction.ASK_ADMIN,
                message: 'Ask an admin to review the connection.',
            },
        });
        await agentStatusHandler({ verbose: false });
        expect(console.error).toHaveBeenCalledExactlyOnceWith(
            'Ask an admin to review the connection.',
        );
        expect(process.exitCode).toBe(1);
    });

    it('requires a configured project', async () => {
        vi.mocked(getConfig).mockResolvedValue({});
        await expect(agentStatusHandler({ verbose: false })).rejects.toThrow(
            ParameterError,
        );
        await expect(agentStatusHandler({ verbose: false })).rejects.toThrow(
            'lightdash config set-project',
        );
        expect(lightdashApi).not.toHaveBeenCalled();
    });

    it('resolves an explicit project slug instead of the configured project', async () => {
        const otherProjectUuid = '00000000-0000-0000-0000-000000000002';
        vi.mocked(lightdashApi)
            .mockResolvedValueOnce([
                { slug: 'my-project', projectUuid: otherProjectUuid },
            ])
            .mockResolvedValueOnce(connectedAgentAccess);
        await agentStatusHandler({ project: 'my-project', verbose: false });
        expect(lightdashApi).toHaveBeenNthCalledWith(1, {
            method: 'GET',
            url: '/api/v1/org/projects',
            body: undefined,
        });
        expect(lightdashApi).toHaveBeenNthCalledWith(2, {
            method: 'GET',
            url: `/api/v2/projects/${otherProjectUuid}/ai-access/me`,
            body: undefined,
        });
    });
});
