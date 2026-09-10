import { type LightdashModelWithSource } from '../types/lightdashModel';
import { type LightdashProjectConfig } from '../types/lightdashProjectConfig';
import { type WarehouseSqlBuilder } from '../types/warehouse';
import { convertLightdashModelToDbtModel } from './lightdashModelConverter';
import { convertExplores, type ConvertExploresOptions } from './translator';

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
} & ConvertExploresOptions) =>
    convertExplores(
        models.map((model) =>
            convertLightdashModelToDbtModel(model, model.sourcePath),
        ),
        loadSources,
        warehouseSqlBuilder.getAdapterType(),
        warehouseSqlBuilder,
        lightdashProjectConfig,
        options,
    );
