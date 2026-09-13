import { Ability } from '@casl/ability';
import {
    FeatureFlags,
    NotFoundError,
    ParameterError,
    ProjectType,
    type PossibleAbilities,
    type SessionUser,
} from '@lightdash/common';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { defaultSessionUser } from '../../auth/account/account.mock';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { LearnSandboxService } from './LearnSandboxService';

const user: SessionUser = {
    ...defaultSessionUser,
    organizationUuid: 'org',
    ability: new Ability<PossibleAbilities>([
        {
            action: 'manage',
            subject: 'DeployProject',
            conditions: { projectUuid: 'copy' },
        },
    ]),
};

const lightdashConfig = {
    ...lightdashConfigMock,
    siteUrl: 'https://learn.test',
};

describe('LearnSandboxService', () => {
    const files = {
        listFiles: vi.fn(),
        getFile: vi.fn(),
        upsertFile: vi.fn(),
        createCommand: vi.fn(),
        getCommand: vi.fn(),
        findActiveCommand: vi.fn(),
        updateCommand: vi.fn(),
        appendOutput: vi.fn(),
        readOutput: vi.fn(),
        listCommandsWithTokens: vi.fn(),
        clearToken: vi.fn(),
    };
    const featureFlagModel = {
        get: vi.fn(async () => ({
            id: FeatureFlags.EnableLearn,
            enabled: true,
        })),
    };
    const projectModel = {
        getSummary: vi.fn(async (uuid: string) => ({
            projectUuid: uuid,
            organizationUuid: 'org',
            type: ProjectType.PREVIEW,
            upstreamProjectUuid: 'training',
            createdByUserUuid: user.userUuid,
            name: 'copy',
            slug: 'copy',
        })),
    };
    const schedulerClient = { learnSandboxCommand: vi.fn(async () => 'job-1') };
    const service = new LearnSandboxService({
        lightdashConfig,
        learnWorkspaceModel: files as never,
        projectModel,
        featureFlagModel,
        personalAccessTokenService: {
            createPersonalAccessToken: vi.fn(),
            deletePersonalAccessToken: vi.fn(),
        },
        userService: { getSessionByUserUuidAndOrg: vi.fn() },
        schedulerClient,
    });

    beforeEach(() => {
        vi.clearAllMocks();
        featureFlagModel.get.mockResolvedValue({ enabled: true } as never);
    });

    it('lists bundle files as read-only and overlay models as editable', async () => {
        files.listFiles.mockResolvedValueOnce([
            { path: 'models/orders.yml', content: 'version: 2\n' },
        ]);
        const result = await service.listFiles(user, 'copy');
        expect(result).toContainEqual({
            path: 'dbt_project.yml',
            editable: false,
        });
        expect(result).toContainEqual({
            path: 'models/orders.yml',
            editable: true,
        });
    });

    it('rejects saving a non-editable path', async () => {
        await expect(
            service.saveFile(user, 'copy', 'dbt_project.yml', 'x'),
        ).rejects.toThrow(ParameterError);
    });

    it('rejects invalid YAML and oversized content', async () => {
        await expect(
            service.saveFile(user, 'copy', 'models/orders.yml', 'a: ['),
        ).rejects.toThrow(ParameterError);
        await expect(
            service.saveFile(
                user,
                'copy',
                'models/orders.yml',
                'x'.repeat(64 * 1024 + 1),
            ),
        ).rejects.toThrow(ParameterError);
    });

    it('saves a valid model file', async () => {
        await service.saveFile(
            user,
            'copy',
            'models/orders.yml',
            'version: 2\n',
        );
        expect(files.upsertFile).toHaveBeenCalledWith(
            'copy',
            'models/orders.yml',
            'version: 2\n',
        );
    });

    it('returns 404 when learn is off', async () => {
        featureFlagModel.get.mockResolvedValueOnce({ enabled: false } as never);
        await expect(service.listFiles(user, 'copy')).rejects.toThrow(
            NotFoundError,
        );
    });

    it('rejects a disallowed command with the terminal message', async () => {
        await expect(
            service.enqueueCommand(user, 'copy', {
                tool: 'dbt',
                subcommand: 'run',
                args: [],
            }),
        ).rejects.toThrow(
            'That command is not available in the Learn terminal',
        );
    });

    it('refuses a second concurrent command', async () => {
        files.findActiveCommand.mockResolvedValueOnce({
            command_uuid: 'c0',
            status: 'running',
        });
        await expect(
            service.enqueueCommand(user, 'copy', {
                tool: 'dbt',
                subcommand: 'parse',
                args: [],
            }),
        ).rejects.toThrow('A command is already running in this workspace');
    });

    it('creates the command row and enqueues the task', async () => {
        files.findActiveCommand.mockResolvedValueOnce(undefined);
        files.createCommand.mockResolvedValueOnce({ commandUuid: 'c1' });
        const result = await service.enqueueCommand(user, 'copy', {
            tool: 'dbt',
            subcommand: 'parse',
            args: [],
        });
        expect(result).toEqual({ commandUuid: 'c1' });
        expect(schedulerClient.learnSandboxCommand).toHaveBeenCalledWith(
            expect.objectContaining({
                commandUuid: 'c1',
                projectUuid: 'copy',
                userUuid: user.userUuid,
            }),
        );
    });

    it('reads output after a sequence number', async () => {
        files.getCommand.mockResolvedValueOnce({
            command_uuid: 'c1',
            project_uuid: 'copy',
            status: 'done',
            exit_code: 0,
            argv: ['dbt', 'parse'],
        });
        files.readOutput.mockResolvedValueOnce([
            { seq: 3, stream: 'stdout', text: 'ok' },
        ]);
        const out = await service.getOutput(user, 'copy', 'c1', 2);
        expect(out.chunks).toEqual([{ seq: 3, stream: 'stdout', text: 'ok' }]);
        expect(files.readOutput).toHaveBeenCalledWith('c1', 2);
    });

    it('rejects access to a project the user cannot manage', async () => {
        await expect(service.listFiles(user, 'other')).rejects.toThrow();
    });

    it('404s reading output for a command outside the project', async () => {
        files.getCommand.mockResolvedValueOnce({
            command_uuid: 'c1',
            project_uuid: 'another-project',
            status: 'done',
            exit_code: 0,
            argv: ['dbt', 'parse'],
        });
        await expect(service.getOutput(user, 'copy', 'c1', 0)).rejects.toThrow(
            NotFoundError,
        );
    });
});

describe('LearnSandboxService.runCommand', () => {
    const files = {
        listFiles: vi.fn(),
        getFile: vi.fn(),
        upsertFile: vi.fn(),
        createCommand: vi.fn(),
        getCommand: vi.fn(),
        findActiveCommand: vi.fn(),
        updateCommand: vi.fn(),
        appendOutput: vi.fn(),
        readOutput: vi.fn(),
        listCommandsWithTokens: vi.fn(),
        clearToken: vi.fn(),
    };
    const featureFlagModel = {
        get: vi.fn(async () => ({
            id: FeatureFlags.EnableLearn,
            enabled: true,
        })),
    };
    const projectModel = {
        getSummary: vi.fn(async (uuid: string) => ({
            projectUuid: uuid,
            organizationUuid: 'org',
            type: ProjectType.PREVIEW,
            upstreamProjectUuid: 'training',
            createdByUserUuid: user.userUuid,
            name: 'copy',
            slug: 'copy',
        })),
    };
    const schedulerClient = { learnSandboxCommand: vi.fn(async () => 'job-1') };

    const originalEnv = { ...process.env };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        process.env = { ...originalEnv };
    });

    it('runs a fake dbt, streams output, scrubs the token, and revokes the PAT', async () => {
        const bin = await mkdtemp(path.join(tmpdir(), 'learn-bin-'));
        await writeFile(
            path.join(bin, 'dbt'),
            '#!/bin/sh\necho "parse ok key=$LIGHTDASH_API_KEY project=$LIGHTDASH_PROJECT"\necho "warn" 1>&2\nexit 0\n',
            { mode: 0o755 },
        );
        process.env.LEARN_SANDBOX_PATH_PREFIX = bin;
        const appended: unknown[] = [];
        files.getCommand.mockResolvedValue({
            command_uuid: 'c1',
            project_uuid: 'copy',
            user_uuid: user.userUuid,
            status: 'queued',
            argv: ['dbt', 'parse'],
            pat_uuid: null,
        });
        files.listFiles.mockResolvedValue([]);
        files.appendOutput.mockImplementation(async (_id, chunks) => {
            appended.push(...chunks);
        });
        const pat = {
            createPersonalAccessToken: vi.fn(async () => ({
                uuid: 'pat-1',
                token: 'ldpat_abc',
                createdAt: new Date(),
                lastUsedAt: null,
                rotatedAt: null,
                expiresAt: null,
                description: 'Learn sandbox command c1',
            })),
            deletePersonalAccessToken: vi.fn(async () => undefined),
        };
        const userService = {
            getSessionByUserUuidAndOrg: vi.fn(async () => user),
        };
        const svc = new LearnSandboxService({
            lightdashConfig,
            learnWorkspaceModel: files as never,
            projectModel,
            featureFlagModel,
            personalAccessTokenService: pat,
            userService,
            schedulerClient,
        });
        await svc.runCommand({
            commandUuid: 'c1',
            projectUuid: 'copy',
            organizationUuid: 'org',
            userUuid: user.userUuid,
        });
        const text = (appended as { text: string }[])
            .map((c) => c.text)
            .join('');
        expect(text).toContain('parse ok key=*** project=copy');
        expect(text).toContain('warn');
        expect(text).not.toContain('ldpat_abc');
        expect(pat.deletePersonalAccessToken).toHaveBeenCalledWith(
            expect.anything(),
            'pat-1',
        );
        expect(files.updateCommand).toHaveBeenLastCalledWith(
            'c1',
            expect.objectContaining({
                status: 'done',
                exit_code: 0,
                pat_uuid: null,
            }),
        );
        await rm(bin, { recursive: true, force: true });
    });

    it('marks a non-zero exit as error and still revokes the PAT', async () => {
        const bin = await mkdtemp(path.join(tmpdir(), 'learn-bin-'));
        await writeFile(
            path.join(bin, 'dbt'),
            '#!/bin/sh\necho "boom" 1>&2\nexit 3\n',
            { mode: 0o755 },
        );
        process.env.LEARN_SANDBOX_PATH_PREFIX = bin;
        files.getCommand.mockResolvedValue({
            command_uuid: 'c2',
            project_uuid: 'copy',
            user_uuid: user.userUuid,
            status: 'queued',
            argv: ['dbt', 'parse'],
            pat_uuid: null,
        });
        files.listFiles.mockResolvedValue([]);
        files.appendOutput.mockResolvedValue(undefined);
        const pat = {
            createPersonalAccessToken: vi.fn(async () => ({
                uuid: 'pat-2',
                token: 'ldpat_xyz',
                createdAt: new Date(),
                lastUsedAt: null,
                rotatedAt: null,
                expiresAt: null,
                description: 'Learn sandbox command c2',
            })),
            deletePersonalAccessToken: vi.fn(async () => undefined),
        };
        const userService = {
            getSessionByUserUuidAndOrg: vi.fn(async () => user),
        };
        const svc = new LearnSandboxService({
            lightdashConfig,
            learnWorkspaceModel: files as never,
            projectModel,
            featureFlagModel,
            personalAccessTokenService: pat,
            userService,
            schedulerClient,
        });
        await svc.runCommand({
            commandUuid: 'c2',
            projectUuid: 'copy',
            organizationUuid: 'org',
            userUuid: user.userUuid,
        });
        expect(pat.deletePersonalAccessToken).toHaveBeenCalledWith(
            expect.anything(),
            'pat-2',
        );
        expect(files.updateCommand).toHaveBeenLastCalledWith(
            'c2',
            expect.objectContaining({ status: 'error', exit_code: 3 }),
        );
        await rm(bin, { recursive: true, force: true });
    });

    it('marks a timeout', async () => {
        const bin = await mkdtemp(path.join(tmpdir(), 'learn-bin-'));
        await writeFile(path.join(bin, 'sleep'), '#!/bin/sh\nsleep 5\n', {
            mode: 0o755,
        });
        process.env.LEARN_SANDBOX_PATH_PREFIX = bin;
        files.getCommand.mockResolvedValue({
            command_uuid: 'c3',
            project_uuid: 'copy',
            user_uuid: user.userUuid,
            status: 'queued',
            argv: ['sleep', '5'],
            pat_uuid: null,
        });
        files.listFiles.mockResolvedValue([]);
        files.appendOutput.mockResolvedValue(undefined);
        const pat = {
            createPersonalAccessToken: vi.fn(async () => ({
                uuid: 'pat-3',
                token: 'ldpat_timeout',
                createdAt: new Date(),
                lastUsedAt: null,
                rotatedAt: null,
                expiresAt: null,
                description: 'Learn sandbox command c3',
            })),
            deletePersonalAccessToken: vi.fn(async () => undefined),
        };
        const userService = {
            getSessionByUserUuidAndOrg: vi.fn(async () => user),
        };
        const svc = new LearnSandboxService({
            lightdashConfig,
            learnWorkspaceModel: files as never,
            projectModel,
            featureFlagModel,
            personalAccessTokenService: pat,
            userService,
            schedulerClient,
            commandTimeoutMs: 200,
        });
        await svc.runCommand({
            commandUuid: 'c3',
            projectUuid: 'copy',
            organizationUuid: 'org',
            userUuid: user.userUuid,
        });
        expect(pat.deletePersonalAccessToken).toHaveBeenCalledWith(
            expect.anything(),
            'pat-3',
        );
        expect(files.updateCommand).toHaveBeenLastCalledWith(
            'c3',
            expect.objectContaining({ status: 'timeout' }),
        );
        await rm(bin, { recursive: true, force: true });
    }, 10_000);
});
