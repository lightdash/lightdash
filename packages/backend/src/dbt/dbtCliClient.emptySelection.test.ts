import { DbtError, SupportedDbtVersions } from '@lightdash/common';
import execa from 'execa';
import * as fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { DbtAbortError } from './DbtAbortError';
import { DbtCliClient } from './dbtCliClient';
import { cliArgs, manifestMock } from './dbtCliClient.mock';

vi.mock('execa');

const invocationId = 'synthetic-invocation';
const manifest = {
    ...manifestMock,
    metadata: { ...manifestMock.metadata, invocation_id: invocationId },
    nodes: {
        'model.synthetic.matched': {
            unique_id: 'model.synthetic.matched',
            resource_type: 'model',
            config: { materialized: 'view' },
        },
    },
};

const emptyError = (selector: string, version: SupportedDbtVersions) => {
    const enabled = Number(version.slice(1).split('.')[1]) >= 8;
    const warning = version === SupportedDbtVersions.V1_12 ? '[WARNING]: ' : '';
    const prefix = version === SupportedDbtVersions.V1_12 ? '[ERROR]: ' : '';
    return {
        info: {
            name: 'MainEncounteredError',
            code: 'Z002',
            level: 'error',
            invocation_id: invocationId,
            msg: `${prefix}Encountered an error:\nCompilation Error\n  ${warning}The selection criterion '${selector}' does not match any ${enabled ? 'enabled ' : ''}nodes`,
        },
    };
};

describe.each(Object.values(SupportedDbtVersions))(
    'empty dbt selection %s',
    (dbtVersion) => {
        let directory: string;
        let client: DbtCliClient;
        let baselinePath: string;

        beforeEach(async () => {
            vi.resetAllMocks();
            directory = await fs.mkdtemp(path.join(os.tmpdir(), 'empty-dbt-'));
            baselinePath = path.join(directory, 'baseline.msgpack');
            client = new DbtCliClient({
                ...cliArgs,
                dbtVersion,
                dbtProjectDirectory: directory,
                selector: 'tag:absent',
                partialParseBaselinePath: baselinePath,
            });
        });

        afterEach(async () => {
            await client.cleanup();
            await fs.rm(directory, { recursive: true, force: true });
        });

        const failSelection = ({
            logs = [emptyError('tag:absent', dbtVersion)],
            artifact = JSON.stringify(manifest),
            exitCode = 2,
            killed = false,
            timedOut = false,
            signal = null as string | null,
            stdout = '',
        } = {}) => {
            vi.mocked(execa).mockImplementationOnce((async (
                _exec: string,
                _args: string[],
                options: { env: Record<string, string> },
            ) => {
                const target = options.env.DBT_TARGET_PATH;
                await fs.writeFile(
                    path.join(target, 'manifest.json'),
                    artifact,
                );
                await fs.writeFile(
                    path.join(target, 'partial_parse.msgpack'),
                    'new parse',
                );
                throw Object.assign(new Error('dbt failed'), {
                    all: logs.map((log) => JSON.stringify(log)).join('\n'),
                    stdout,
                    exitCode,
                    killed,
                    timedOut,
                    signal,
                });
            }) as never);
        };

        it.each(['tag:absent', 'tag:absent,matched'])(
            'returns the full fresh manifest and saves the parse for %s',
            async (selector) => {
                client.selector = selector;
                failSelection({ logs: [emptyError(selector, dbtVersion)] });
                await expect(client.getDbtManifest()).resolves.toEqual({
                    manifest,
                    selectedModelIds: [],
                });
                expect(execa).toHaveBeenCalledTimes(1);
                expect(vi.mocked(execa).mock.calls[0][1]).not.toContain(
                    '--warn-error-options',
                );
                await expect(fs.readFile(baselinePath, 'utf8')).resolves.toBe(
                    'new parse',
                );
            },
        );

        it.each([
            'tag:absent matched',
            'matched tag:absent',
            'tag:absent tag:also_absent',
        ])('keeps the union %s as a failure', async (selector) => {
            client.selector = selector;
            failSelection();
            await expect(client.getDbtManifest()).rejects.toBeInstanceOf(
                DbtError,
            );
            await expect(fs.stat(baselinePath)).rejects.toMatchObject({
                code: 'ENOENT',
            });
        });

        it('rejects an unrelated promoted warning', async () => {
            const log = emptyError('tag:absent', dbtVersion);
            log.info.msg =
                'Encountered an error:\nCompilation Error\n  synthetic parse warning';
            failSelection({ logs: [log] });
            await expect(client.getDbtManifest()).rejects.toBeInstanceOf(
                DbtError,
            );
        });

        it('rejects an empty-selection message with a second error', async () => {
            const log = emptyError('tag:absent', dbtVersion);
            failSelection({
                logs: [log, { info: { ...log.info, msg: 'another error' } }],
            });
            await expect(client.getDbtManifest()).rejects.toBeInstanceOf(
                DbtError,
            );
        });

        it.each([
            [
                'a stale invocation',
                JSON.stringify({
                    ...manifest,
                    metadata: {
                        ...manifest.metadata,
                        invocation_id: 'old-invocation',
                    },
                }),
            ],
            ['an absent invocation', JSON.stringify(manifestMock)],
            ['an invalid manifest', '{}'],
            ['malformed JSON', '{'],
        ])('rejects %s without saving a baseline', async (_name, artifact) => {
            failSelection({ artifact });
            await expect(client.getDbtManifest()).rejects.toBeInstanceOf(
                DbtError,
            );
            await expect(fs.stat(baselinePath)).rejects.toMatchObject({
                code: 'ENOENT',
            });
        });

        it.each([1, 137])('rejects exit code %s', async (exitCode) => {
            failSelection({ exitCode });
            await expect(client.getDbtManifest()).rejects.toBeInstanceOf(
                DbtError,
            );
        });

        it('rejects a killed process', async () => {
            failSelection({ killed: true });
            await expect(client.getDbtManifest()).rejects.toBeInstanceOf(
                DbtError,
            );
        });

        it('rejects a timed out process', async () => {
            failSelection({ timedOut: true });
            await expect(client.getDbtManifest()).rejects.toBeInstanceOf(
                DbtError,
            );
        });

        it('rejects an interrupted process', async () => {
            failSelection({ signal: 'SIGTERM' });
            await expect(client.getDbtManifest()).rejects.toBeInstanceOf(
                DbtError,
            );
        });

        it('rejects a failure without an invocation id', async () => {
            const log = emptyError('tag:absent', dbtVersion);
            log.info.invocation_id = '';
            failSelection({ logs: [log] });
            await expect(client.getDbtManifest()).rejects.toBeInstanceOf(
                DbtError,
            );
        });

        it('rejects output that contains selected models', async () => {
            failSelection({
                stdout: JSON.stringify({
                    unique_id: 'model.synthetic.matched',
                }),
            });
            await expect(client.getDbtManifest()).rejects.toBeInstanceOf(
                DbtError,
            );
        });

        it('does not recover a failure from dbt deps', async () => {
            failSelection();
            await expect(client.installDeps()).rejects.toBeInstanceOf(DbtError);
        });

        it('honours an abort before execution', async () => {
            const controller = new AbortController();
            controller.abort();
            await expect(
                client.getDbtManifest({
                    externalNodes: [],
                    signal: controller.signal,
                }),
            ).rejects.toBeInstanceOf(DbtAbortError);
            expect(execa).not.toHaveBeenCalled();
        });
    },
);
