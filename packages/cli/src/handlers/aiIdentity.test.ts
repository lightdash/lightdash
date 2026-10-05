import {
    AiIdentityJobKind,
    AiIdentityJobStatus,
    AiIdentityState,
    type AiAccessForUser,
    type AiIdentity,
    type AiIdentityAccount,
    type AiIdentityJob,
    type AiIdentityListResult,
} from '@lightdash/common';
import { readFile, rm } from 'fs/promises';
import fetch from 'node-fetch';
import { getConfig } from '../config';
import {
    aiIdentitiesListHandler,
    aiIdentitiesTestHandler,
    aiIdentityHandler,
} from './aiIdentity';
import { lightdashApi } from './dbt/apiClient';

vi.mock('../config', () => ({ getConfig: vi.fn() }));
vi.mock('./dbt/apiClient', () => ({ lightdashApi: vi.fn() }));
vi.mock('node-fetch', () => ({ default: vi.fn() }));

const counts = { ready: 0, pending: 0, failed: 0, needs_sign_in: 0, total: 0 };
const account: AiIdentityAccount = {
    aiIdentityAccountUuid: 'account-1',
    snowflakeAccount: 'ACCOUNT',
    twinNameTemplate: null,
    lastFullCheckAt: null,
    counts,
};
const job: AiIdentityJob = {
    jobUuid: 'job-1',
    kind: AiIdentityJobKind.EXPORT,
    status: AiIdentityJobStatus.DONE,
    total: 1,
    done: 1,
    fileUrl: 'https://storage.example/export',
    error: null,
    createdAt: new Date(),
};
const identity: AiIdentity = {
    aiIdentityUuid: 'identity-1',
    aiIdentityAccountUuid: 'account-1',
    snowflakeAccount: 'ACCOUNT',
    userUuid: 'person-1',
    email: 'person@example.com',
    firstName: 'Person',
    lastName: 'One',
    snowflakeLogin: 'PERSON',
    twinNameOverride: null,
    twinName: 'PERSON_AI',
    publicKey: null,
    publicKeyFingerprint: null,
    state: AiIdentityState.PENDING,
    stale: false,
    failureReason: null,
    statusMessage: null,
    checkedAt: null,
    createdAt: new Date('2026-10-05T12:00:00Z'),
};
const page: AiIdentityListResult = {
    data: [],
    pagination: { page: 1, pageSize: 100, totalResults: 0, totalPageCount: 1 },
    counts,
    failureGroups: [],
};

beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    vi.mocked(getConfig).mockResolvedValue({
        context: { project: 'project-1' },
    });
});
afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
});

it('shows the selected project identity, last check and action', async () => {
    const access: AiAccessForUser = {
        projectUuid: 'project-1',
        restrictionsOn: true,
        warehouseType: 'snowflake',
        aiIdentityRequired: true,
        state: AiIdentityState.PENDING,
        aiIdentityName: 'PERSON_AI',
        lastCheckedAt: new Date('2026-10-05T12:00:00Z'),
        action: 'ask_admin',
        message: 'Ask an admin to set it up.',
        rawSqlAllowed: false,
    };
    vi.mocked(lightdashApi).mockResolvedValue(access);
    await aiIdentityHandler({ project: 'explicit-project' });
    expect(lightdashApi).toHaveBeenCalledWith(
        expect.objectContaining({
            url: '/api/v2/user/me/ai-access?projectUuid=explicit-project',
        }),
    );
    expect(process.stdout.write).toHaveBeenCalledWith(
        expect.stringContaining('PERSON_AI'),
    );
    expect(process.stdout.write).toHaveBeenCalledWith(
        expect.stringContaining('2026-10-05T12:00:00.000Z'),
    );
    expect(process.stdout.write).toHaveBeenCalledWith(
        expect.stringContaining('Ask an admin'),
    );
});

it('uses the stored project and prints no action for ready identities', async () => {
    vi.stubEnv('LIGHTDASH_PROJECT_UUID', 'environment-project');
    vi.mocked(lightdashApi).mockResolvedValue({
        state: AiIdentityState.READY,
        aiIdentityName: 'PERSON_AI',
        lastCheckedAt: null,
        message: null,
    } as AiAccessForUser);
    await aiIdentityHandler({});
    expect(lightdashApi).toHaveBeenCalledWith(
        expect.objectContaining({
            url: expect.stringContaining('environment-project'),
        }),
    );
    expect(process.stdout.write).toHaveBeenCalledWith(
        expect.stringContaining('No action needed.'),
    );
    vi.unstubAllEnvs();
});

it('pages through all list results with the chosen state', async () => {
    vi.mocked(lightdashApi)
        .mockResolvedValueOnce([account])
        .mockResolvedValueOnce({
            ...page,
            data: [identity],
            pagination: { ...page.pagination, totalPageCount: 2 },
        })
        .mockResolvedValueOnce(page);
    await aiIdentitiesListHandler({ pending: true, format: 'json' });
    expect(lightdashApi).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
            url: expect.stringContaining('page=1&pageSize=100&state=pending'),
        }),
    );
    expect(lightdashApi).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({
            url: expect.stringContaining('page=2&pageSize=100&state=pending'),
        }),
    );
    expect(process.stdout.write).toHaveBeenCalledWith(
        `${JSON.stringify([identity], null, 2)}\n`,
    );
});

it('lists accounts and refuses to guess when several exist', async () => {
    vi.mocked(lightdashApi).mockResolvedValue([
        account,
        { ...account, aiIdentityAccountUuid: 'account-2' },
    ]);
    await expect(aiIdentitiesListHandler({})).rejects.toThrow(
        'Choose an account',
    );
    expect(process.stderr.write).toHaveBeenCalledWith(
        expect.stringContaining('account-2'),
    );
    expect(lightdashApi).toHaveBeenCalledTimes(1);
});

it('rejects unknown accounts and conflicting filters', async () => {
    vi.mocked(lightdashApi).mockResolvedValue([account]);
    await expect(aiIdentitiesListHandler({ account: 'other' })).rejects.toThrow(
        'not found',
    );
    await expect(
        aiIdentitiesListHandler({ pending: true, failed: true }),
    ).rejects.toThrow('one state');
    await expect(aiIdentitiesListHandler({ state: 'unknown' })).rejects.toThrow(
        'Unknown',
    );
    await expect(
        aiIdentitiesTestHandler({ failed: true, all: true }),
    ).rejects.toThrow('either');
});

it('polls exports every two seconds and downloads without forwarding the API token', async () => {
    vi.useFakeTimers();
    vi.mocked(lightdashApi)
        .mockResolvedValueOnce([account])
        .mockResolvedValueOnce({ ...job, status: AiIdentityJobStatus.QUEUED })
        .mockResolvedValueOnce({ ...job, status: AiIdentityJobStatus.RUNNING })
        .mockResolvedValueOnce(job);
    vi.mocked(fetch).mockResolvedValue({
        ok: true,
        text: async () => 'CREATE USER example;',
    } as Awaited<ReturnType<typeof fetch>>);
    const result = aiIdentitiesListHandler({ pending: true, format: 'sql' });
    await vi.advanceTimersByTimeAsync(1999);
    expect(lightdashApi).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(lightdashApi).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(2000);
    await result;
    expect(fetch).toHaveBeenCalledExactlyOnceWith(job.fileUrl);
    expect(process.stdout.write).toHaveBeenCalledExactlyOnceWith(
        'CREATE USER example;',
    );
    expect(process.stderr.write).toHaveBeenCalledWith('done: 1/1\n');
    expect(lightdashApi).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
            body: JSON.stringify({
                filter: {
                    aiIdentityAccountUuid: 'account-1',
                    states: ['pending'],
                    reasons: [],
                    projectUuid: null,
                    search: null,
                    staleOnly: false,
                },
                format: 'sql',
                roleForTwin: null,
            }),
        }),
    );
});

it('writes CSV to the output file', async () => {
    const output = `/tmp/ai-identities-test-${process.pid}.csv`;
    vi.mocked(lightdashApi)
        .mockResolvedValueOnce([account])
        .mockResolvedValueOnce(job);
    vi.mocked(fetch).mockResolvedValue({
        ok: true,
        text: async () => 'state\npending\n',
    } as Awaited<ReturnType<typeof fetch>>);
    try {
        await aiIdentitiesListHandler({ format: 'csv', output });
        expect(await readFile(output, 'utf8')).toBe('state\npending\n');
        expect(process.stdout.write).not.toHaveBeenCalled();
    } finally {
        await rm(output, { force: true });
    }
});

it('fails on an unsuccessful job or download', async () => {
    vi.mocked(lightdashApi)
        .mockResolvedValueOnce([account])
        .mockResolvedValueOnce({
            ...job,
            status: AiIdentityJobStatus.FAILED,
            error: 'Export failed',
        });
    await expect(aiIdentitiesListHandler({ format: 'sql' })).rejects.toThrow(
        'Export failed',
    );
    expect(fetch).not.toHaveBeenCalled();
    vi.mocked(lightdashApi)
        .mockResolvedValueOnce([account])
        .mockResolvedValueOnce(job);
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 403 } as Awaited<
        ReturnType<typeof fetch>
    >);
    await expect(aiIdentitiesListHandler({ format: 'csv' })).rejects.toThrow(
        '403',
    );
});

it.each([true, false])('submits a bulk test with failed=%s', async (failed) => {
    vi.mocked(lightdashApi)
        .mockResolvedValueOnce([account])
        .mockResolvedValueOnce(job);
    await aiIdentitiesTestHandler({ failed });
    expect(lightdashApi).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
            method: 'POST',
            url: '/api/v2/org/ai-identities/bulk-test',
            body: JSON.stringify({
                filter: {
                    aiIdentityAccountUuid: 'account-1',
                    states: failed ? ['failed'] : [],
                    reasons: [],
                    projectUuid: null,
                    search: null,
                    staleOnly: false,
                },
            }),
        }),
    );
});
