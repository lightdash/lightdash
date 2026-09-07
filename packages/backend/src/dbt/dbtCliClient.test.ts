import { DbtError, SupportedDbtVersions } from '@lightdash/common';
import { ChildProcess } from 'child_process';
import execa, { type ExecaReturnValue } from 'execa';
import * as fs from 'fs/promises';
import { DbtCliClient } from './dbtCliClient';
import {
    cliArgs as cliArgsWithoutVersion,
    cliMocks,
    expectedCommandOptions,
    expectedDbtOptions,
    expectedPackages,
    manifestMock,
    packagesYml,
} from './dbtCliClient.mock';

type ExecaString = (
    file: string,
    args?: readonly string[],
    options?: execa.Options,
) => execa.ExecaChildProcess;

const execaMock = vi.mocked(execa as ExecaString);

function mockProcessKill(signal?: NodeJS.Signals | number): boolean;
function mockProcessKill(signal?: string, options?: execa.KillOptions): void;
function mockProcessKill(): boolean {
    return true;
}

const successfulExecaResult = (): ExecaReturnValue => ({
    command: 'dbt',
    escapedCommand: 'dbt',
    exitCode: 0,
    stdout: '',
    stderr: '',
    failed: false,
    timedOut: false,
    killed: false,
    isCanceled: false,
    ...cliMocks.success,
});

const createExecaProcess = (
    result: Promise<ExecaReturnValue>,
    cancel: () => void = vi.fn(),
    pid?: number,
): execa.ExecaChildProcess => {
    const child = Object.assign(new ChildProcess(), {
        then: result.then.bind(result),
        catch: result.catch.bind(result),
        finally: result.finally.bind(result),
        [Symbol.toStringTag]: 'Promise',
        cancel,
        kill: mockProcessKill,
        pid,
    });
    return child;
};

const createSuccessfulExecaProcess = () =>
    createExecaProcess(Promise.resolve(successfulExecaResult()));

const createFailedExecaProcess = () =>
    createExecaProcess(Promise.reject(cliMocks.error));

const createPendingExecaProcess = (pid?: number) => {
    let resolve: (value: ExecaReturnValue) => void = () => undefined;
    let reject: (reason: unknown) => void = () => undefined;
    const result = new Promise<ExecaReturnValue>(
        (resolveResult, rejectResult) => {
            resolve = resolveResult;
            reject = rejectResult;
        },
    );
    const cancel = vi.fn(() => {
        reject(Object.assign(new Error('cancelled'), { isCanceled: true }));
    });
    const process = createExecaProcess(result, cancel, pid);
    return { process, cancel, resolve };
};

vi.mock('fs/promises', () => ({
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdtemp: vi.fn(),
    rm: vi.fn(),
}));
vi.mock('execa');

Object.values(SupportedDbtVersions).map((dbtVersion) => {
    const cliArgs = {
        ...cliArgsWithoutVersion,
        dbtVersion,
    };
    return describe(`DbtCliClient ${dbtVersion}`, () => {
        beforeEach(() => {
            vi.resetAllMocks();
            vi.mocked(fs.mkdtemp).mockResolvedValue(
                '/tmp/dbt_target_test' as never,
            );
        });
        it('should install dependencies with success', async () => {
            execaMock.mockReturnValueOnce(createSuccessfulExecaProcess());

            const client = new DbtCliClient(cliArgs);
            const dbtExec = client.getDbtExec();

            await expect(client.installDeps()).resolves.toEqual(undefined);
            await expect(execaMock).toHaveBeenCalledTimes(1);
            await expect(execaMock).toHaveBeenCalledWith(
                dbtExec,
                [...expectedDbtOptions, 'deps', ...expectedCommandOptions],
                expect.anything(),
            );
        });
        it('should error on install dependencies', async () => {
            execaMock.mockReturnValueOnce(createFailedExecaProcess());

            const client = new DbtCliClient(cliArgs);

            await expect(client.installDeps()).rejects.toThrowError(DbtError);
        });
        it('should get manifest with success', async () => {
            execaMock.mockReturnValueOnce(createSuccessfulExecaProcess());
            vi.spyOn(fs, 'readFile').mockImplementationOnce(async () =>
                JSON.stringify(manifestMock),
            );

            const client = new DbtCliClient(cliArgs);
            const dbtExec = client.getDbtExec();

            await expect(client.getDbtManifest()).resolves.toEqual({
                manifest: manifestMock,
            });
            await expect(execaMock).toHaveBeenCalledTimes(1);
            await expect(execaMock).toHaveBeenCalledWith(
                dbtExec,
                [
                    ...expectedDbtOptions,
                    'ls',
                    '--output',
                    'json',
                    '--output-keys',
                    'unique_id',
                    ...expectedCommandOptions,
                ],
                expect.anything(),
            );
        });
        it('should get packages with success', async () => {
            vi.spyOn(fs, 'readFile').mockImplementationOnce(
                async () => packagesYml,
            );

            const client = new DbtCliClient(cliArgs);

            await expect(client.getDbtPackages()).resolves.toEqual(
                expectedPackages,
            );
        });
        it('should ignore error when packages.yml doesnt exist', async () => {
            vi.spyOn(fs, 'readFile').mockImplementationOnce(() => {
                throw new Error('file not found');
            });

            const client = new DbtCliClient(cliArgs);

            await expect(client.getDbtPackages()).resolves.toBeUndefined();
        });
    });
});

// Pinned to one dbt version: the environment is version independent, and the
// matrix above would repeat these nine times for nothing.
describe('DbtCliClient environment', () => {
    const cliArgs = {
        ...cliArgsWithoutVersion,
        dbtVersion: SupportedDbtVersions.V1_10,
    };

    beforeEach(() => {
        vi.resetAllMocks();
        vi.mocked(fs.mkdtemp).mockResolvedValue(
            '/tmp/dbt_target_test' as never,
        );
        execaMock.mockImplementation(createSuccessfulExecaProcess);
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('does not extend the backend environment', async () => {
        await new DbtCliClient(cliArgs).installDeps();
        const options = execaMock.mock.calls[0]?.[2];

        expect(options).toMatchObject({ extendEnv: false });
    });

    it('does not hand backend secrets to dbt', async () => {
        vi.stubEnv('LIGHTDASH_SECRET', 'not-for-dbt');
        vi.stubEnv('PATH', '/usr/local/bin');

        await new DbtCliClient(cliArgs).installDeps();
        const options = execaMock.mock.calls[0]?.[2];
        const env = options?.env ?? {};

        expect(env).not.toHaveProperty('LIGHTDASH_SECRET');
        expect(Object.values(env)).not.toContain('not-for-dbt');
        expect(env.PATH).toEqual('/usr/local/bin');
    });

    it('hands allowlisted machine variables to dbt', async () => {
        vi.stubEnv('UTILS_PII_SALT', 'machine-owned-salt');

        await new DbtCliClient({
            ...cliArgs,
            environmentVariableAllowlist: ['UTILS_PII_SALT'],
        }).installDeps();
        const options = execaMock.mock.calls[0]?.[2];

        expect(options?.env).toMatchObject({
            UTILS_PII_SALT: 'machine-owned-salt',
        });
    });

    it('passes the scoped git config to dbt without exposing a token', async () => {
        await new DbtCliClient({
            ...cliArgs,
            gitConfigGlobalPath: '/tmp/lightdash-gitconfig',
        }).installDeps();
        const options = execaMock.mock.calls[0]?.[2];
        const env = options?.env ?? {};

        expect(env.GIT_CONFIG_GLOBAL).toEqual('/tmp/lightdash-gitconfig');
        expect(env.GIT_TERMINAL_PROMPT).toEqual('0');
        expect(Object.values(env)).not.toContain('ghs_private-token');
    });

    it('adds the GitHub App installation hint to dbt deps errors', async () => {
        execaMock.mockReturnValueOnce(createFailedExecaProcess());

        await expect(
            new DbtCliClient({
                ...cliArgs,
                dbtDepsErrorHint:
                    'Ensure the package is in the same GitHub App installation.',
            }).installDeps(),
        ).rejects.toThrow(
            'Ensure the package is in the same GitHub App installation.',
        );
    });

    it('cannot be pointed at another target directory by a project', async () => {
        await new DbtCliClient({
            ...cliArgs,
            environment: { DBT_TARGET_PATH: '/tmp/attacker' },
        }).installDeps();
        const options = execaMock.mock.calls[0]?.[2];

        expect(options?.env).toMatchObject({
            DBT_TARGET_PATH: '/tmp/dbt_target_test',
        });
    });
});

describe('DbtCliClient cancellation', () => {
    const cliArgs = {
        ...cliArgsWithoutVersion,
        dbtVersion: SupportedDbtVersions.V1_10,
    };

    beforeEach(() => {
        vi.resetAllMocks();
        vi.mocked(fs.mkdtemp).mockResolvedValue(
            '/tmp/dbt_target_test' as never,
        );
    });

    it('cancels an active dbt process when its signal aborts', async () => {
        const pending = createPendingExecaProcess(12345);
        const kill = vi.spyOn(process, 'kill').mockReturnValue(true);
        execaMock.mockReturnValueOnce(pending.process);
        const controller = new AbortController();
        const client = new DbtCliClient(cliArgs);
        client.setAbortSignal(controller.signal);
        try {
            const command = client.installDeps();
            const result = command.then(
                () => undefined,
                (error: unknown) => error,
            );
            await vi.waitFor(() => expect(execaMock).toHaveBeenCalledTimes(1));
            controller.abort();

            expect(await result).toMatchObject({ isCanceled: true });
            expect(pending.cancel).toHaveBeenCalledTimes(1);
            expect(kill).toHaveBeenCalledWith(-12345, 'SIGKILL');
        } finally {
            kill.mockRestore();
        }
    });

    it('removes the abort listener after a dbt process completes', async () => {
        const pending = createPendingExecaProcess();
        execaMock.mockReturnValueOnce(pending.process);
        const controller = new AbortController();
        const client = new DbtCliClient(cliArgs);
        client.setAbortSignal(controller.signal);

        const command = client.installDeps();
        await vi.waitFor(() => expect(execaMock).toHaveBeenCalledTimes(1));
        pending.resolve({
            all: '',
            stdout: '',
        } as ExecaReturnValue);
        await command;
        controller.abort();

        expect(pending.cancel).not.toHaveBeenCalled();
    });
});
