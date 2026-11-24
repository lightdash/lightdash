import { Ability } from '@casl/ability';
import {
    DimensionType,
    ExternalSourceScope,
    ExternalSourceStatus,
    ExternalSourceType,
    ForbiddenError,
    NotFoundError,
    ParameterError,
    type ExternalSource,
    type RegisteredAccount,
    type SessionUser,
} from '@lightdash/common';
import { Readable } from 'stream';
import { analyticsMock } from '../../../analytics/LightdashAnalytics.mock';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import { CSV_UPLOAD_TOKEN_HEADER, mintCsvUploadToken } from './csvUploadToken';
import { ExternalSourceService } from './ExternalSourceService';

const projectUuid = 'project-uuid';
const sourceUuid = 'source-uuid';
const userUuid = 'user-uuid';
const lightdashSecrets = {
    active: 'secret',
    fallbacks: [],
    all: ['secret'],
};
const account = { user: { id: userUuid } } as RegisteredAccount;

const stagedSource = (
    overrides: Partial<ExternalSource> = {},
): ExternalSource => ({
    sourceUuid,
    projectUuid,
    type: ExternalSourceType.CSV,
    scope: ExternalSourceScope.CATALOG,
    name: '_staged_1',
    connection: {
        type: ExternalSourceType.CSV,
        originalFilename: 'targets.csv',
    },
    status: ExternalSourceStatus.STAGED,
    errorMessage: null,
    createdByUserUuid: userUuid,
    lastRefreshedAt: null,
    tables: [],
    ...overrides,
});

type PrivateMethods = {
    assertAccess: () => Promise<{ organizationUuid: string; userUuid: string }>;
    assertEngineAvailable: () => void;
    uploadTrackedObject: (data: Record<string, unknown>) => Promise<number>;
    describeRawCsv: (rawKey: string) => Promise<unknown>;
};

const buildService = ({
    source = stagedSource(),
    objectActive = false,
}: { source?: ExternalSource; objectActive?: boolean } = {}) => {
    const externalSourceModel = {
        createSource: vi.fn().mockResolvedValue(source),
        getSource: vi.fn().mockResolvedValue(source),
        isObjectActive: vi.fn().mockResolvedValue(objectActive),
        deleteSource: vi.fn().mockResolvedValue(undefined),
    };
    const service = new ExternalSourceService({
        lightdashConfig: {
            ...lightdashConfigMock,
            siteUrl: 'https://acme.lightdash.cloud',
            lightdashSecrets,
            externalSources: {
                ...lightdashConfigMock.externalSources,
                maxFileSizeBytes: 1_000,
            },
        },
        analytics: analyticsMock,
        externalSourceModel,
        projectModel: {
            getSummary: vi
                .fn()
                .mockResolvedValue({ organizationUuid: 'org-uuid' }),
        },
    } as never);
    const privates = service as unknown as PrivateMethods;
    vi.spyOn(privates, 'assertAccess').mockResolvedValue({
        organizationUuid: 'org-uuid',
        userUuid,
    });
    vi.spyOn(privates, 'assertEngineAvailable').mockReturnValue(undefined);
    const uploadTrackedObject = vi
        .spyOn(privates, 'uploadTrackedObject')
        .mockResolvedValue(12);
    const describeRawCsv = vi
        .spyOn(privates, 'describeRawCsv')
        .mockResolvedValue({
            inferredColumns: {
                region: { reference: 'region', type: DimensionType.STRING },
            },
            sampleRows: [{ region: 'EMEA' }],
        });
    const createCsvTable = vi
        .spyOn(service, 'createCsvTable')
        .mockResolvedValue(
            stagedSource({ status: ExternalSourceStatus.SYNCING }),
        );
    return {
        service,
        externalSourceModel,
        uploadTrackedObject,
        describeRawCsv,
        createCsvTable,
    };
};

const body = (contentLength: number, contentType = 'text/csv') => ({
    contentType,
    contentLength,
    body: Readable.from(['region\nEMEA\n']),
});

const tokenFor = (sizeBytes = 12, overrides = {}) =>
    mintCsvUploadToken(lightdashSecrets, {
        projectUuid,
        sourceUuid,
        userUuid,
        sizeBytes,
        ...overrides,
    }).token;

describe('ExternalSourceService.prepareCsvUpload', () => {
    it('stages a catalog source and returns a signed upload to this instance', async () => {
        const { service, externalSourceModel } = buildService();

        const prepared = await service.prepareCsvUpload(account, projectUuid, {
            filename: 'targets.csv',
            sizeBytes: 12,
        });

        expect(externalSourceModel.createSource).toHaveBeenCalledWith(
            expect.objectContaining({
                projectUuid,
                scope: ExternalSourceScope.CATALOG,
                status: ExternalSourceStatus.STAGED,
                createdByUserUuid: userUuid,
                connection: {
                    type: ExternalSourceType.CSV,
                    originalFilename: 'targets.csv',
                },
            }),
        );
        expect(prepared.uploadId).toBe(sourceUuid);
        expect(prepared.uploadRequest).toEqual({
            method: 'PUT',
            url: `https://acme.lightdash.cloud/api/v1/ee/projects/${projectUuid}/external-sources/${sourceUuid}/upload`,
            headers: {
                'Content-Type': 'text/csv',
                [CSV_UPLOAD_TOKEN_HEADER]: expect.any(String),
            },
        });
    });

    it.each([
        ['a file that is not CSV or TSV', 'targets.xlsx', 12],
        ['an empty file', 'targets.csv', 0],
        ['a file over the size limit', 'targets.csv', 1_001],
    ])('rejects %s before staging anything', async (_label, filename, size) => {
        const { service, externalSourceModel } = buildService();

        await expect(
            service.prepareCsvUpload(account, projectUuid, {
                filename,
                sizeBytes: size,
            }),
        ).rejects.toThrow(ParameterError);
        expect(externalSourceModel.createSource).not.toHaveBeenCalled();
    });
});

describe('ExternalSourceService.receivePreparedCsvUpload', () => {
    it('stores the file as the upload’s first raw version', async () => {
        const { service, uploadTrackedObject } = buildService();

        const received = await service.receivePreparedCsvUpload(
            tokenFor(),
            projectUuid,
            sourceUuid,
            body(12),
        );

        expect(received).toEqual({ uploadId: sourceUuid, sizeBytes: 12 });
        expect(uploadTrackedObject).toHaveBeenCalledWith(
            expect.objectContaining({
                organizationUuid: 'org-uuid',
                projectUuid,
                sourceUuid,
                key: expect.stringMatching(
                    new RegExp(`${projectUuid}/${sourceUuid}/raw/v1\\.csv$`),
                ),
                purpose: 'raw',
                expectedBytes: 12,
            }),
        );
    });

    it.each([
        {
            label: 'a token for another upload',
            setup: {},
            token: () => tokenFor(12, { sourceUuid: 'other-source' }),
            size: 12,
            error: ForbiddenError,
        },
        {
            label: 'a body of a different size',
            setup: {},
            token: () => tokenFor(12),
            size: 13,
            error: ParameterError,
        },
        {
            label: 'a link that was already used',
            setup: { objectActive: true },
            token: () => tokenFor(12),
            size: 12,
            error: ForbiddenError,
        },
        {
            label: 'an upload that was already committed',
            setup: {
                source: stagedSource({ status: ExternalSourceStatus.READY }),
            },
            token: () => tokenFor(12),
            size: 12,
            error: ForbiddenError,
        },
    ])(
        'rejects $label and writes nothing',
        async ({ setup, token, size, error }) => {
            const { service, uploadTrackedObject } = buildService(setup);

            await expect(
                service.receivePreparedCsvUpload(
                    token(),
                    projectUuid,
                    sourceUuid,
                    body(size),
                ),
            ).rejects.toThrow(error);
            expect(uploadTrackedObject).not.toHaveBeenCalled();
        },
    );
});

describe('ExternalSourceService.commitPreparedCsvUpload', () => {
    it('reads the columns, then creates the table', async () => {
        const { service, createCsvTable, describeRawCsv } = buildService({
            objectActive: true,
        });

        const committed = await service.commitPreparedCsvUpload(
            account,
            projectUuid,
            sourceUuid,
            { tableName: 'sales_targets', label: null },
        );

        expect(describeRawCsv).toHaveBeenCalledWith(
            expect.stringMatching(/raw\/v1\.csv$/),
        );
        expect(createCsvTable).toHaveBeenCalledWith(
            account,
            projectUuid,
            sourceUuid,
            { tableName: 'sales_targets' },
        );
        expect(committed.inferredColumns).toEqual({
            region: { reference: 'region', type: DimensionType.STRING },
        });
        expect(committed.sampleRows).toEqual([{ region: 'EMEA' }]);
    });

    it('asks for the file when nothing was uploaded', async () => {
        const { service, createCsvTable } = buildService();

        await expect(
            service.commitPreparedCsvUpload(account, projectUuid, sourceUuid, {
                tableName: 'sales_targets',
                label: null,
            }),
        ).rejects.toThrow('The file has not been uploaded yet');
        expect(createCsvTable).not.toHaveBeenCalled();
    });

    it("hides someone else's upload", async () => {
        const { service } = buildService({
            source: stagedSource({ createdByUserUuid: 'someone-else' }),
            objectActive: true,
        });

        await expect(
            service.commitPreparedCsvUpload(account, projectUuid, sourceUuid, {
                tableName: 'sales_targets',
                label: null,
            }),
        ).rejects.toThrow(NotFoundError);
    });

    it('drops the upload when the file is not a readable CSV', async () => {
        const { service, describeRawCsv, externalSourceModel, createCsvTable } =
            buildService({ objectActive: true });
        describeRawCsv.mockRejectedValue(new Error('not a csv'));

        await expect(
            service.commitPreparedCsvUpload(account, projectUuid, sourceUuid, {
                tableName: 'sales_targets',
                label: null,
            }),
        ).rejects.toThrow('Could not read the file as CSV');
        expect(externalSourceModel.deleteSource).toHaveBeenCalledWith(
            projectUuid,
            sourceUuid,
        );
        expect(createCsvTable).not.toHaveBeenCalled();
    });
});

describe('ExternalSourceService.canUploadCsv', () => {
    const buildGateService = (storageConfigured = true) =>
        new ExternalSourceService({
            lightdashConfig: {
                ...lightdashConfigMock,
                preAggregates: {
                    ...lightdashConfigMock.preAggregates,
                    s3: storageConfigured
                        ? lightdashConfigMock.preAggregates.s3
                        : undefined,
                },
            },
            analytics: analyticsMock,
            projectModel: {
                getSummary: vi
                    .fn()
                    .mockResolvedValue({ organizationUuid: 'org-uuid' }),
            },
        } as never);

    const userManaging = (managedProjectUuid: string) =>
        ({
            userUuid,
            organizationUuid: 'org-uuid',
            ability: new Ability([
                {
                    action: 'manage',
                    subject: 'ExternalSource',
                    conditions: { projectUuid: managedProjectUuid },
                },
            ]),
        }) as unknown as SessionUser;

    it('allows someone who can manage uploads in the project', async () => {
        await expect(
            buildGateService().canUploadCsv(
                userManaging(projectUuid),
                projectUuid,
            ),
        ).resolves.toBe(true);
    });

    it('refuses someone who can only manage uploads elsewhere', async () => {
        await expect(
            buildGateService().canUploadCsv(
                userManaging('other-project'),
                projectUuid,
            ),
        ).resolves.toBe(false);
    });

    it('allows any project with that right when none is pinned', async () => {
        await expect(
            buildGateService().canUploadCsv(
                userManaging('other-project'),
                undefined,
            ),
        ).resolves.toBe(true);
    });

    it('refuses everyone when the instance has no storage for uploads', async () => {
        await expect(
            buildGateService(false).canUploadCsv(
                userManaging(projectUuid),
                projectUuid,
            ),
        ).resolves.toBe(false);
    });
});
