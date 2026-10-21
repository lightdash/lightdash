import { DbtError, SupportedDbtVersions } from '@lightdash/common';
import execa from 'execa';
import * as fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { performance } from 'perf_hooks';
import Logger from '../logging/logger';
import { DbtCliClient } from './dbtCliClient';

const executables = process.env.LIGHTDASH_TEST_DBT_EXECUTABLES;
const matrix = executables
    ? executables.split(',').map((entry) => {
          const separator = entry.indexOf('=');
          const version = entry.slice(0, separator).trim();
          const executable = entry.slice(separator + 1).trim();
          const dbtVersion = Object.values(SupportedDbtVersions).find(
              (supported) => supported === `v${version}`,
          );
          if (separator < 1 || !executable || !dbtVersion) {
              throw new Error(
                  'LIGHTDASH_TEST_DBT_EXECUTABLES must contain supported version=path pairs',
              );
          }
          return { version, executable: path.resolve(executable), dbtVersion };
      })
    : [];

describe.skipIf(!executables)('empty selectors with real dbt', () => {
    describe.each(matrix)(
        'dbt $version',
        ({ version, executable, dbtVersion }) => {
            let directory: string;
            let client: DbtCliClient;
            let environment: Record<string, string>;
            let calls: number;

            beforeEach(async () => {
                directory = await fs.mkdtemp(
                    path.join(os.tmpdir(), 'dbt-selector-'),
                );
                await fs.mkdir(path.join(directory, 'models'));
                const minor = Number(version.split('.')[1]);
                const policy = {
                    [minor >= 10 ? 'error' : 'include']: [
                        'NoNodesForSelectionCriteria',
                        'JinjaLogWarning',
                    ],
                };
                environment =
                    minor < 6
                        ? { DBT_WARN_ERROR_OPTIONS: JSON.stringify(policy) }
                        : {};
                await fs.writeFile(
                    path.join(directory, 'dbt_project.yml'),
                    [
                        'name: selector_fixture',
                        "version: '1.0'",
                        'config-version: 2',
                        'profile: selector_fixture',
                        ...(minor >= 6
                            ? [
                                  'flags:',
                                  `  warn_error_options: ${JSON.stringify(policy)}`,
                              ]
                            : []),
                    ].join('\n'),
                );
                await fs.writeFile(
                    path.join(directory, 'profiles.yml'),
                    [
                        'selector_fixture:',
                        '  target: dev',
                        '  outputs:',
                        '    dev:',
                        '      type: postgres',
                        '      host: localhost',
                        '      port: 1',
                        '      user: synthetic',
                        '      password: synthetic',
                        '      dbname: synthetic',
                        '      schema: synthetic',
                        '      threads: 1',
                    ].join('\n'),
                );
                await fs.writeFile(
                    path.join(directory, 'models', 'matched.sql'),
                    'select 1 as id',
                );
                client = new DbtCliClient({
                    dbtProjectDirectory: directory,
                    dbtProfilesDirectory: directory,
                    environment,
                    environmentVariableAllowlist: [],
                    explicitCredentials: false,
                    dbtVersion,
                    selector: 'tag:absent',
                    partialParseBaselinePath: path.join(
                        directory,
                        'baseline.msgpack',
                    ),
                });
                calls = 0;
                vi.spyOn(client, 'getDbtExec').mockImplementation(() => {
                    calls += 1;
                    return executable;
                });
            });

            afterEach(async () => {
                await client.cleanup();
                await fs.rm(directory, { recursive: true, force: true });
            });

            it('proves the native warning failure and recovers fresh full and partial parses', async () => {
                const started = performance.now();
                const native = await execa(
                    executable,
                    [
                        '--no-use-colors',
                        '--log-format',
                        'json',
                        'ls',
                        '--output',
                        'json',
                        '--output-keys',
                        'unique_id',
                        '--select',
                        'tag:absent',
                        '--profiles-dir',
                        directory,
                        '--project-dir',
                        directory,
                    ],
                    {
                        cwd: directory,
                        reject: false,
                        env: {
                            ...environment,
                            DBT_SEND_ANONYMOUS_USAGE_STATS: 'false',
                            DBT_PARTIAL_PARSE: 'true',
                        },
                    },
                );
                const beforeWallMs = performance.now() - started;
                expect(native.exitCode).toBe(2);
                const errors = DbtCliClient.parseDbtJsonLogs(
                    native.stdout,
                ).filter((log) => log.info.level === 'error');
                expect(errors).toHaveLength(1);
                expect(errors[0].info.name).toBe('MainEncounteredError');
                expect(errors[0].info.msg).toMatch(
                    /^(?:\[ERROR\]: )?Encountered an error:\nCompilation Error\n {2}(?:\[WARNING\]: )?The selection criterion 'tag:absent' does not match any (?:enabled )?nodes$/,
                );
                expect(
                    DbtCliClient.parseModelIdsFromStdout(native.stdout),
                ).toEqual([]);
                const metricsPath = process.env.LIGHTDASH_TEST_DBT_METRICS_PATH;
                if (metricsPath) {
                    await fs.appendFile(
                        metricsPath,
                        `${JSON.stringify({
                            version,
                            stage: 'native',
                            wallMs: beforeWallMs,
                            exitCode: native.exitCode,
                            error: errors[0].info.msg,
                        })}\n`,
                    );
                }
                const measured: number[] = [];
                const info = vi.spyOn(Logger, 'info').mockClear();
                await [false, true].reduce(async (previous, partial) => {
                    await previous;
                    const start = performance.now();
                    const result = await client.getDbtManifest();
                    measured.push(performance.now() - start);
                    expect(result.selectedModelIds).toEqual([]);
                    expect(Object.keys(result.manifest.nodes)).toEqual([
                        'model.selector_fixture.matched',
                    ]);
                    const baseline = await fs.readFile(
                        path.join(directory, 'baseline.msgpack'),
                    );
                    expect(baseline.byteLength).toBeGreaterThan(0);
                    const { metadata } = result.manifest;
                    expect(metadata.adapter_type).toBe('postgres');
                    if (partial) {
                        expect(client.partialParseSeeded).toBe(true);
                        expect(info).toHaveBeenCalledWith(
                            'dbt.partialParse command=ls seeded=true reused=true',
                            expect.objectContaining({
                                seeded: true,
                                reused: true,
                            }),
                        );
                    }
                    await client.cleanup();
                }, Promise.resolve());
                expect(calls).toBe(2);
                if (metricsPath) {
                    await fs.appendFile(
                        metricsPath,
                        `${JSON.stringify({
                            version,
                            stage: 'client',
                            afterColdWallMs: measured[0],
                            afterPartialWallMs: measured[1],
                            invocations: calls,
                        })}\n`,
                    );
                }
            }, 60000);

            it('uses one invocation for a matched selector', async () => {
                client.selector = 'matched';
                const result = await client.getDbtManifest();
                expect(result.selectedModelIds).toEqual([
                    'model.selector_fixture.matched',
                ]);
                expect(calls).toBe(1);
            }, 30000);

            it('recovers an empty intersection in one invocation', async () => {
                client.selector = 'tag:absent,matched';
                const result = await client.getDbtManifest();
                expect(result.selectedModelIds).toEqual([]);
                expect(Object.keys(result.manifest.nodes)).toEqual([
                    'model.selector_fixture.matched',
                ]);
                expect(calls).toBe(1);
            }, 30000);

            it.each([
                'tag:absent matched',
                'matched tag:absent',
                'tag:absent tag:also_absent',
            ])(
                'rejects the union %s',
                async (selector) => {
                    client.selector = selector;
                    await expect(
                        client.getDbtManifest(),
                    ).rejects.toBeInstanceOf(DbtError);
                    expect(calls).toBe(1);
                },
                30000,
            );

            it('keeps another project warning promoted to an error', async () => {
                await fs.writeFile(
                    path.join(directory, 'models', 'matched.sql'),
                    "{{ exceptions.warn('synthetic promoted warning') }} select 1 as id",
                );
                const failure = client.getDbtManifest();
                await expect(failure).rejects.toBeInstanceOf(DbtError);
                await expect(failure).rejects.toMatchObject({
                    logs: expect.arrayContaining([
                        expect.objectContaining({
                            info: expect.objectContaining({
                                msg: expect.stringContaining(
                                    'synthetic promoted warning',
                                ),
                            }),
                        }),
                    ]),
                });
                await expect(
                    fs.stat(path.join(directory, 'baseline.msgpack')),
                ).rejects.toMatchObject({ code: 'ENOENT' });
                expect(calls).toBe(1);
            }, 30000);
        },
    );
});
