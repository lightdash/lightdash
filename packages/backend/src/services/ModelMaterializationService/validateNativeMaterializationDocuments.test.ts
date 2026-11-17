import {
    DbtProjectType,
    FeatureFlags,
    WarehouseTypes,
    type Project,
} from '@lightdash/common';
import { expectedProject } from '../../models/ProjectModel/ProjectModel.mock';
import { validateNativeMaterializationDocuments } from './validateNativeMaterializationDocuments';

const project: Project = {
    ...expectedProject,
    dbtConnection: { type: DbtProjectType.NONE },
    warehouseConnection: {
        type: WarehouseTypes.POSTGRES,
        host: 'localhost',
        port: 5432,
        dbname: 'test',
        schema: 'raw',
    },
};
const source = {
    name: 'items',
    content:
        'type: model\nname: items\nsql_from: raw.items\nmaterialize: {max_rows: 5}\ndimensions: []',
};
const setup = (enabled: boolean) => ({
    projectModel: {
        get: vi.fn().mockResolvedValue(project),
        getWarehouseCredentialsForBinding: vi.fn(),
    },
    featureFlagModel: { get: vi.fn().mockResolvedValue({ enabled }) },
    warehouseClientFactory: { withWarehouseClient: vi.fn() },
});

describe('publishing native model definitions', () => {
    it('accepts ordinary YAML without a flag or warehouse lookup', async () => {
        const service = setup(false);
        await validateNativeMaterializationDocuments(
            service,
            project.projectUuid,
            [{ name: 'items', content: null }],
        );
        expect(service.projectModel.get).not.toHaveBeenCalled();
        expect(
            service.warehouseClientFactory.withWarehouseClient,
        ).not.toHaveBeenCalled();
    });
    it('rejects opt-in while Studio editing is off', async () => {
        const service = setup(false);
        await expect(
            validateNativeMaterializationDocuments(
                service,
                project.projectUuid,
                [source],
            ),
        ).rejects.toThrow('This feature is not enabled');
        expect(service.featureFlagModel.get).toHaveBeenCalledWith({
            featureFlagId: FeatureFlags.SemanticStudioEditing,
            user: { organizationUuid: project.organizationUuid },
        });
        expect(
            service.warehouseClientFactory.withWarehouseClient,
        ).not.toHaveBeenCalled();
    });
    it.each(['dbt', 'personal', 'other model', 'invalid source'] as const)(
        'rejects %s before catalog access',
        async (kind) => {
            const service = setup(true);
            const document = { ...source };
            if (kind === 'dbt')
                service.projectModel.get.mockResolvedValue({
                    ...project,
                    dbtConnection: { type: DbtProjectType.DBT },
                });
            if (kind === 'personal')
                service.projectModel.get.mockResolvedValue({
                    ...project,
                    warehouseConnection: {
                        ...project.warehouseConnection,
                        requireUserCredentials: true,
                    },
                });
            if (kind === 'other model') document.name = 'another';
            if (kind === 'invalid source')
                document.content = document.content.replace(
                    'raw.items',
                    'items',
                );
            await expect(
                validateNativeMaterializationDocuments(
                    service,
                    project.projectUuid,
                    [document],
                ),
            ).rejects.toThrow(/model/i);
            expect(
                service.warehouseClientFactory.withWarehouseClient,
            ).not.toHaveBeenCalled();
        },
    );
});
