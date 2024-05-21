import { subject } from '@casl/ability';
import {
    ApiCatalogSearch,
    CatalogField,
    CatalogTable,
    CatalogType,
    Explore,
    ExploreError,
    ForbiddenError,
    isExploreError,
    SessionUser,
    UserAttributeValueMap,
} from '@lightdash/common';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { LightdashConfig } from '../../config/parseConfig';
import { CatalogModel } from '../../models/CatalogModel/CatalogModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SearchModel } from '../../models/SearchModel';
import { UserAttributesModel } from '../../models/UserAttributesModel';
import { BaseService } from '../BaseService';
import {
    doesExploreMatchRequiredAttributes,
    getFilteredExplore,
} from '../UserAttributesService/UserAttributeUtils';

type CatalogArguments = {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    projectModel: ProjectModel;
    userAttributesModel: UserAttributesModel;
    catalogModel: CatalogModel;
};

export class CatalogService extends BaseService {
    lightdashConfig: LightdashConfig;

    analytics: LightdashAnalytics;

    projectModel: ProjectModel;

    userAttributesModel: UserAttributesModel;

    catalogModel: CatalogModel;

    constructor({
        lightdashConfig,
        analytics,
        projectModel,
        userAttributesModel,
        catalogModel,
    }: CatalogArguments) {
        super();
        this.lightdashConfig = lightdashConfig;
        this.analytics = analytics;
        this.projectModel = projectModel;
        this.userAttributesModel = userAttributesModel;
        this.catalogModel = catalogModel;
    }

    private static async getCatalogFields(
        explores: (Explore | ExploreError)[],
        userAttributes: UserAttributeValueMap,
    ): Promise<CatalogField[]> {
        return explores.reduce<CatalogField[]>((acc, explore) => {
            if (isExploreError(explore)) {
                return acc;
            }
            if (doesExploreMatchRequiredAttributes(explore, userAttributes)) {
                const fields: CatalogField[] = Object.values(
                    explore.tables,
                ).flatMap((t) => {
                    const tableFields = [
                        ...Object.values(t.dimensions),
                        ...Object.values(t.metrics),
                    ];
                    return tableFields.map((d) => ({
                        name: d.name,
                        description: d.description,
                        tableLabel: d.tableLabel,
                        fieldType: d.fieldType,
                        type: CatalogType.Field,
                    }));
                });

                return [...acc, ...fields];
            }
            return acc;
        }, []);
    }

    private static async getCatalogTables(
        explores: (Explore | ExploreError)[],
        userAttributes: UserAttributeValueMap,
    ): Promise<CatalogTable[]> {
        return explores.reduce<CatalogTable[]>((acc, explore) => {
            if (isExploreError(explore)) {
                return [
                    ...acc,
                    {
                        name: explore.name,
                        errors: explore.errors,
                        groupLabel: explore.groupLabel,
                        description:
                            explore.baseTable &&
                            explore.tables?.[explore.baseTable]?.description,
                        type: CatalogType.Table,
                    },
                ];
            }
            if (doesExploreMatchRequiredAttributes(explore, userAttributes)) {
                return [
                    ...acc,
                    {
                        name: explore.name,
                        description:
                            explore.tables[explore.baseTable].description,
                        type: CatalogType.Table,
                    },
                ];
            }
            return acc;
        }, []);
    }

    private async searchCatalog(
        projectUuid: string,
        query: string,
    ): Promise<(CatalogTable | CatalogField)[]> {
        const catalog = await this.catalogModel.search(projectUuid, query);
        // TODO filter permissions
        return catalog;
    }

    async getCatalog(
        user: SessionUser,
        projectUuid: string,
        { search, type }: ApiCatalogSearch,
    ) {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );
        if (
            user.ability.cannot(
                'view',
                subject('Project', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        const explores = await this.projectModel.getExploresFromCache(
            projectUuid,
        );
        if (!explores) {
            return [];
        }
        const userAttributes =
            await this.userAttributesModel.getAttributeValuesForOrgMember({
                organizationUuid,
                userUuid: user.userUuid,
            });

        // We keep errors in the list of explores
        const filteredExplores = explores.reduce<(Explore | ExploreError)[]>(
            (acc, explore) => {
                if (isExploreError(explore)) {
                    return [...acc, explore];
                }
                if (
                    !doesExploreMatchRequiredAttributes(explore, userAttributes)
                ) {
                    return acc;
                }
                const filteredExplore = getFilteredExplore(
                    explore,
                    userAttributes,
                );
                return [...acc, filteredExplore];
            },
            [],
        );

        if (search) {
            // On search we don't show explore errors
            const validExplores: Explore[] = filteredExplores.reduce<Explore[]>(
                (acc, e) => {
                    if (isExploreError(e)) return acc;
                    return [...acc, e];
                },
                [],
            );
            return this.searchCatalog(projectUuid, search);
        }
        if (type === CatalogType.Field)
            return CatalogService.getCatalogFields(
                filteredExplores,
                userAttributes,
            );

        // all tables
        return CatalogService.getCatalogTables(
            filteredExplores,
            userAttributes,
        );
    }
}
