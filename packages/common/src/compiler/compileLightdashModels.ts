import {
    isExploreError,
    type Explore,
    type ExploreError,
} from '../types/explore';
import { type LightdashModelWithSource } from '../types/lightdashModel';
import { type LightdashProjectConfig } from '../types/lightdashProjectConfig';
import { type WarehouseSqlBuilder } from '../types/warehouse';
import { convertLightdashModelToDbtModel } from './lightdashModelConverter';
import { convertExplores, type ConvertExploresOptions } from './translator';

export type NativeMaterializationDocument = {
    name: string;
    content: string | null;
};

const nativeDocuments = new WeakMap<Explore, NativeMaterializationDocument>();

export function attachNativeMaterializationDocument(
    explore: Explore,
    document: NativeMaterializationDocument,
) {
    nativeDocuments.set(explore, document);
}

export function getNativeMaterializationDocument(
    explore: Explore | ExploreError,
): NativeMaterializationDocument | null {
    return isExploreError(explore)
        ? null
        : (nativeDocuments.get(explore) ?? null);
}

export const compileLightdashModels = async ({
    models,
    warehouseSqlBuilder,
    lightdashProjectConfig,
    loadSources = false,
    ...options
}: {
    models: LightdashModelWithSource[];
    warehouseSqlBuilder: WarehouseSqlBuilder;
    lightdashProjectConfig: LightdashProjectConfig;
    loadSources?: boolean;
} & ConvertExploresOptions) => {
    const explores = await convertExplores(
        models.map((model) =>
            convertLightdashModelToDbtModel(model, model.sourcePath),
        ),
        loadSources,
        warehouseSqlBuilder.getAdapterType(),
        warehouseSqlBuilder,
        lightdashProjectConfig,
        options,
    );
    const documents = new Map(
        models.map(({ sourcePath, ...model }) => [
            model.name,
            {
                name: model.name,
                content: model.materialize ? JSON.stringify(model) : null,
            },
        ]),
    );
    for (const explore of explores) {
        if (!isExploreError(explore)) {
            const document = documents.get(
                explore.tables[explore.baseTable]?.originalName ??
                    explore.baseTable,
            );
            if (document)
                attachNativeMaterializationDocument(explore, document);
        }
    }
    return explores;
};
