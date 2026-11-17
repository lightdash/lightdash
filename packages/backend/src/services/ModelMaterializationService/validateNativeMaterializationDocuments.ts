import {
    FeatureFlags,
    ForbiddenError,
    ParameterError,
    parseModelDocument,
    WarehouseTypes,
    type NativeMaterializationDocument,
} from '@lightdash/common';
import {
    isNativeModelProject,
    materializationCatalogCheck,
    materializationModelError,
} from '../../ee/services/SemanticStudioService/materializationSource';
import { type ProjectService } from '../ProjectService/ProjectService';
import { withMaterializationWarehouse } from './withMaterializationWarehouse';

export async function validateNativeMaterializationDocuments(
    service: {
        featureFlagModel: Pick<ProjectService['featureFlagModel'], 'get'>;
        projectModel: Pick<
            ProjectService['projectModel'],
            'get' | 'getWarehouseCredentialsForBinding'
        >;
        warehouseClientFactory: Pick<
            ProjectService['warehouseClientFactory'],
            'withWarehouseClient'
        >;
    },
    projectUuid: string,
    documents: readonly NativeMaterializationDocument[],
): Promise<void> {
    const optedIn = documents.flatMap(({ name, content }) =>
        content === null ? [] : [{ name, content }],
    );
    if (!optedIn.length) return;
    const project = await service.projectModel.get(projectUuid);
    const { enabled } = await service.featureFlagModel.get({
        featureFlagId: FeatureFlags.SemanticStudioEditing,
        user: { organizationUuid: project.organizationUuid },
    });
    if (!enabled) throw new ForbiddenError('This feature is not enabled');
    const first = optedIn[0].name;
    if (
        !isNativeModelProject(project.dbtConnection) ||
        project.connectionRoute === 'multi' ||
        project.warehouseConnection?.type !== WarehouseTypes.POSTGRES ||
        project.warehouseConnection.requireUserCredentials
    ) {
        throw new ParameterError(
            `Model ${first} requires a native project with a shared Postgres connection.`,
        );
    }
    const checks = optedIn.map(({ name, content }) => {
        const model = parseModelDocument(content, `models/${name}.yml`);
        if (name !== model.name || !model.materialize)
            throw new ParameterError(
                `Model ${name} does not match the deployed materialization definition.`,
            );
        const error = materializationModelError(model);
        if (error) throw new ParameterError(`Model ${name}: ${error}`);
        const query = materializationCatalogCheck(model.sql_from);
        if (!query)
            throw new ParameterError(
                `Model ${name} requires a supported SELECT over schema-qualified raw tables.`,
            );
        return { name, query };
    });
    await withMaterializationWarehouse(
        service.projectModel,
        service.warehouseClientFactory,
        projectUuid,
        project.organizationUuid,
        first,
        async (warehouseClient) => {
            await checks.reduce(async (previous, { name, query }) => {
                await previous;
                const { rows } = await warehouseClient.runQuery(query, {});
                if (
                    rows.length !== 1 ||
                    rows[0].materialization_allowed !== true
                )
                    throw new ParameterError(
                        `Model ${name} requires raw tables without row-level security.`,
                    );
            }, Promise.resolve());
        },
    );
}
