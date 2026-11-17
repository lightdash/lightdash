import {
    DbtProjectType,
    FeatureFlags,
    WarehouseTypes,
    type Project,
} from '@lightdash/common';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { type ModelMaterializationModel } from '../../models/ModelMaterializationModel';
import { expectedProject } from '../../models/ProjectModel/ProjectModel.mock';
import { runModelMaterialization } from './runModelMaterialization';

const intent = {
    configUuid: 'config',
    revisionUuid: 'revision',
    policyEpoch: 1,
};
const attempt = {
    ...intent,
    generationUuid: 'generation',
    attemptToken: 'token',
    objectKey: 'key',
    projectUuid: 'project',
    modelName: 'orders',
    content:
        'type: model\nname: orders\nsql_from: raw.orders\ndimensions: []\nmaterialize: {max_rows: 5}\n',
    maxRows: 5,
};
const project: Project = {
    ...expectedProject,
    dbtConnection: { type: DbtProjectType.NONE },
    warehouseConnection: {
        type: WarehouseTypes.POSTGRES,
        host: 'localhost',
        port: 5432,
        dbname: 'test',
        schema: 'raw',
        requireUserCredentials: false,
    },
};
const dependencies = () => ({
    model: {
        claim: vi
            .fn<ModelMaterializationModel['claim']>()
            .mockResolvedValue({ status: 'claimed', attempt }),
        promote: vi.fn(),
        fail: vi.fn(),
    },
    featureFlags: {
        get: vi.fn().mockResolvedValue({
            id: FeatureFlags.SemanticStudioEditing,
            enabled: true,
        }),
    },
    projectModel: {
        get: vi.fn().mockResolvedValue(project),
        getWarehouseCredentialsForBinding: vi
            .fn()
            .mockResolvedValue(project.warehouseConnection),
    },
    warehouseClientFactory: { withWarehouseClient: vi.fn() },
    lightdashConfig: lightdashConfigMock,
});

describe('scheduled model materialization', () => {
    test.each(['ready', 'obsolete'] as const)(
        'acknowledges %s jobs without warehouse access',
        async (status) => {
            const deps = dependencies();
            deps.model.claim.mockResolvedValue({ status });
            await runModelMaterialization(intent, deps);
            expect(deps.projectModel.get).not.toHaveBeenCalled();
            expect(
                deps.warehouseClientFactory.withWarehouseClient,
            ).not.toHaveBeenCalled();
        },
    );

    test('keeps a busy lease retriable', async () => {
        const deps = dependencies();
        deps.model.claim.mockResolvedValue({ status: 'busy' });
        await expect(runModelMaterialization(intent, deps)).rejects.toThrow(
            'lease',
        );
        expect(deps.model.fail).not.toHaveBeenCalled();
    });

    test.each(['disabled', 'personal', 'multi', 'live'] as const)(
        'rejects %s before acquiring a warehouse client',
        async (caseName) => {
            const deps = dependencies();
            if (caseName === 'disabled')
                deps.featureFlags.get.mockResolvedValue({ enabled: false });
            if (caseName === 'multi')
                deps.projectModel.get.mockResolvedValue({
                    ...project,
                    connectionRoute: 'multi',
                });
            if (caseName === 'personal')
                deps.projectModel.get.mockResolvedValue({
                    ...project,
                    warehouseConnection: {
                        ...project.warehouseConnection,
                        requireUserCredentials: true,
                    },
                });
            if (caseName === 'live')
                deps.model.claim.mockResolvedValue({
                    status: 'claimed',
                    attempt: {
                        ...attempt,
                        content: attempt.content.split('materialize:')[0],
                    },
                });
            await runModelMaterialization(intent, deps);
            expect(deps.featureFlags.get).toHaveBeenCalledWith({
                featureFlagId: FeatureFlags.SemanticStudioEditing,
                user: { organizationUuid: project.organizationUuid },
            });
            expect(
                deps.warehouseClientFactory.withWarehouseClient,
            ).not.toHaveBeenCalled();
            expect(deps.model.fail).toHaveBeenCalledWith(
                expect.objectContaining(intent),
                'build_failed',
            );
        },
    );

    test('builds with project credentials without a signed-in user', async () => {
        const deps = dependencies();
        const result = {
            rowCount: 0,
            byteCount: 10,
            nativeSchema: [],
            sourceReadAt: new Date(),
        };
        deps.warehouseClientFactory.withWarehouseClient.mockResolvedValue(
            result,
        );
        deps.model.promote.mockResolvedValue(true);
        await runModelMaterialization(intent, deps);
        expect(
            deps.projectModel.getWarehouseCredentialsForBinding,
        ).toHaveBeenCalledWith(attempt.projectUuid, { kind: 'original' });
        expect(
            deps.warehouseClientFactory.withWarehouseClient,
        ).toHaveBeenCalledWith(
            expect.objectContaining({
                kind: 'resolved',
                credentials: project.warehouseConnection,
            }),
            expect.objectContaining({
                actor: expect.objectContaining({ person: null }),
            }),
            expect.any(Function),
        );
        expect(deps.model.promote).toHaveBeenCalledWith(attempt, result);
    });

    test('stores and throws sanitized errors for infrastructure retries', async () => {
        const deps = dependencies();
        deps.projectModel.get.mockRejectedValue(
            new Error('private connection detail'),
        );
        await expect(runModelMaterialization(intent, deps)).rejects.toThrow(
            /^Model materialization build failed\.$/,
        );
        expect(deps.model.fail).toHaveBeenCalledWith(attempt, 'build_failed');
    });
});
