import {
    DbtProjectType,
    FeatureFlags,
    parseModelDocument,
    WarehouseTypes,
} from '@lightdash/common';
import { PostgresWarehouseClient } from '@lightdash/warehouses';
import { type LightdashConfig } from '../../config/parseConfig';
import { toModelPath } from '../../ee/services/SemanticStudioService/draftFold';
import {
    materializationCatalogCheck,
    materializationModelError,
    materializationSourceSql,
} from '../../ee/services/SemanticStudioService/materializationSource';
import { type FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import {
    type MaterializationBuildIntent,
    type ModelMaterializationModel,
} from '../../models/ModelMaterializationModel';
import { type ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { getDuckdbRuntimeConfig } from '../../utils/duckdb/getDuckdbRuntimeConfig';
import { resolveCaCertFile } from '../../utils/duckdb/resolveCaCertFile';
import {
    ConnectionSurface,
    WarehouseCredentialKind,
} from '../WarehouseClientFactory/ConnectionContext';
import { type WarehouseClientFactory } from '../WarehouseClientFactory/WarehouseClientFactory';
import { buildModelMaterialization } from './buildModelMaterialization';

export async function runModelMaterialization(
    intent: MaterializationBuildIntent,
    {
        model,
        featureFlags,
        projectModel,
        warehouseClientFactory,
        lightdashConfig,
    }: {
        model: Pick<ModelMaterializationModel, 'claim' | 'fail' | 'promote'>;
        featureFlags: Pick<FeatureFlagModel, 'get'>;
        projectModel: Pick<ProjectModel, 'get'>;
        warehouseClientFactory: Pick<
            WarehouseClientFactory,
            'withWarehouseClient'
        >;
        lightdashConfig: LightdashConfig;
    },
): Promise<void> {
    const claim = await model.claim(intent);
    if (claim.status === 'busy')
        throw new Error(
            'A materialization attempt still holds the build lease.',
        );
    if (claim.status !== 'claimed') return;
    const { attempt } = claim;
    try {
        const project = await projectModel.get(attempt.projectUuid);
        const { enabled } = await featureFlags.get({
            featureFlagId: FeatureFlags.SemanticStudioEditing,
            user: { organizationUuid: project.organizationUuid },
        });
        if (
            !enabled ||
            project.dbtConnection.type !== DbtProjectType.NONE ||
            project.connectionRoute === 'multi' ||
            project.warehouseConnection?.type !== WarehouseTypes.POSTGRES ||
            project.warehouseConnection.requireUserCredentials
        ) {
            await model.fail(attempt, 'build_failed');
            return;
        }
        const document = parseModelDocument(
            attempt.content,
            toModelPath(attempt.modelName),
        );
        const catalogSql = materializationCatalogCheck(document.sql_from);
        if (
            !document.materialize ||
            document.materialize.max_rows !== attempt.maxRows ||
            materializationModelError(document) ||
            !catalogSql
        ) {
            await model.fail(attempt, 'build_failed');
            return;
        }
        const storage = lightdashConfig.preAggregates.s3;
        const session = getDuckdbRuntimeConfig(storage);
        if (!storage || !session)
            throw new Error('Missing materialization storage');
        const parquetUri = `s3://${storage.bucket}/${attempt.objectKey}`;
        const caCertFile = session.useSsl ? resolveCaCertFile() : null;
        if (session.useSsl && !caCertFile)
            throw new Error('Missing storage CA bundle');
        const verified = await warehouseClientFactory.withWarehouseClient(
            {
                kind: 'binding',
                projectUuid: attempt.projectUuid,
                binding: { kind: 'original' },
            },
            {
                organizationUuid: project.organizationUuid,
                queryContext: null,
                purpose: 'query',
                aiAccess: 'enforce',
                actor: {
                    surface: ConnectionSurface.SCHEDULE,
                    person: null,
                    aiClient: null,
                },
            },
            async ({
                warehouseClient,
                credentialKind,
                warehouseCredentials,
            }) => {
                if (
                    !(warehouseClient instanceof PostgresWarehouseClient) ||
                    credentialKind !== WarehouseCredentialKind.SHARED ||
                    warehouseCredentials.requireUserCredentials
                ) {
                    throw new Error(
                        'Materialization requires a shared Postgres connection',
                    );
                }
                const { rows } = await warehouseClient.runQuery(catalogSql);
                if (
                    rows.length !== 1 ||
                    rows[0].materialization_allowed !== true
                ) {
                    throw new Error(
                        'Materialization source is no longer eligible',
                    );
                }
                return buildModelMaterialization({
                    warehouse: warehouseClient,
                    sourceSql: materializationSourceSql(document.sql_from),
                    maxRows: attempt.maxRows,
                    parquetUri,
                    s3Config: {
                        ...session,
                        ...(caCertFile ? { caCertFile } : {}),
                        scope: [parquetUri],
                    },
                });
            },
        );
        if (!(await model.promote(attempt, verified)))
            throw new Error('Build lease expired');
    } catch {
        await model.fail(attempt, 'build_failed');
        throw new Error('Model materialization build failed.');
    }
}
