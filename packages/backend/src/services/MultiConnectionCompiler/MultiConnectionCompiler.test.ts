import {
    DbtError,
    DbtProjectType,
    JobStepStatusType,
    JobStepType,
    SupportedDbtVersions,
    type DbtLog,
} from '@lightdash/common';
import knex from 'knex';
import { MockClient } from 'knex-mock-client';
import { JobModel } from '../../models/JobModel/JobModel';
import { type CompileGroupPlan } from '../../projectAdapters/CompileGroup';
import { warehouseClientMock } from '../../utils/QueryBuilder/MetricQueryBuilder.mock';
import { MultiConnectionCompiler } from './MultiConnectionCompiler';

describe('multi-source compilation diagnostics', () => {
    it('persists the dbt error output when an additional source fails', async () => {
        const log: DbtLog = {
            code: 'E001',
            info: {
                category: 'dbt',
                code: 'E001',
                extra: {},
                invocation_id: 'run-uuid',
                level: 'error',
                log_version: 2,
                msg: 'Compilation Error: macro missing_macro is undefined',
                name: 'CompilationError',
                pid: 1,
                thread_name: 'MainThread',
                ts: '2026-10-07T00:00:00Z',
                type: 'log_line',
            },
        };
        const compiler = new MultiConnectionCompiler({
            projectModel: {
                getDbtSourceIdentity: vi.fn().mockResolvedValue({
                    dbtSourceName: 'primary',
                    dbtSourceUuid: 'primary-source-uuid',
                }),
            },
            projectDbtSourcesModel: {},
            warehouseConnectionCompileModel: {},
        } as unknown as ConstructorParameters<
            typeof MultiConnectionCompiler
        >[0]);
        vi.spyOn(compiler, 'planGroups').mockResolvedValue([
            {
                warehouseConnectionUuid: null,
                connectionName: 'Primary warehouse',
                listedDatabases: {
                    listAllDatabases: false,
                    additionalDatabases: [],
                },
                sources: [
                    {
                        name: 'finance',
                        projectDbtSourceUuid: 'finance-source-uuid',
                        precedence: 1,
                        dbtConnection: { type: DbtProjectType.NONE },
                    },
                ],
            } as unknown as CompileGroupPlan,
        ]);
        const jobModel = new JobModel({
            database: knex({ client: MockClient, dialect: 'pg' }),
        });
        vi.spyOn(jobModel, 'startJobStep').mockResolvedValue();
        const updateStep = vi
            .spyOn(jobModel, 'updateJobStep')
            .mockResolvedValue();
        vi.spyOn(jobModel, 'update').mockResolvedValue();

        await expect(
            jobModel.tryJobStep('job-uuid', JobStepType.COMPILING, () =>
                compiler.compile({
                    projectUuid: 'project-uuid',
                    primary: {
                        manifest: { nodes: {} },
                        warehouseCredentials: warehouseClientMock.credentials,
                        cachedWarehouse: {},
                    } as Parameters<typeof compiler.compile>[0]['primary'],
                    dbtVersion: SupportedDbtVersions.V1_7,
                    includeUnboundSources: true,
                    fetchSourceManifest: async () => {
                        throw new DbtError('Failed to run dbt ls', [log]);
                    },
                    loadExtraCredentials: vi.fn(),
                }),
            ),
        ).rejects.toThrow('Failed to load dbt source "finance"');

        expect(updateStep).toHaveBeenCalledWith(
            'job-uuid',
            JobStepStatusType.ERROR,
            JobStepType.COMPILING,
            expect.stringContaining('finance'),
            [log],
        );
    });
});
