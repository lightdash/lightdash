import { subject } from '@casl/ability';
import {
    ApiCatalogSearch,
    CatalogField,
    CatalogMetadata,
    CatalogTable,
    CatalogType,
    CompiledTable,
    Explore,
    ExploreError,
    ForbiddenError,
    isDimension,
    isExploreError,
    SessionUser,
    UserAttributeValueMap,
} from '@lightdash/common';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { LightdashConfig } from '../../config/parseConfig';
import { CatalogModel } from '../../models/CatalogModel/CatalogModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { UserAttributesModel } from '../../models/UserAttributesModel';
import { wrapSentryTransaction } from '../../utils';
import { BaseService } from '../BaseService';
import {
    doesExploreMatchRequiredAttributes,
    getFilteredExplore,
    hasUserAttributes,
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

    private static parseFieldsFromCompiledTable(
        table: CompiledTable,
    ): CatalogField[] {
        const tableFields = [
            ...Object.values(table.dimensions),
            ...Object.values(table.metrics),
        ];
        return tableFields.map((d) => ({
            name: d.name,
            description: d.description,
            tableLabel: d.tableLabel,
            fieldType: d.fieldType,
            basicType: isDimension(d) ? d.type : 'number', // TODO convert metrics into types
            type: CatalogType.Field,
        }));
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
                ).flatMap((t) =>
                    CatalogService.parseFieldsFromCompiledTable(t),
                );

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
                        groupLabel: explore.groupLabel,
                    },
                ];
            }
            return acc;
        }, []);
    }

    private async searchCatalog(
        projectUuid: string,
        query: string,
        userAttributes: UserAttributeValueMap,
    ): Promise<(CatalogTable | CatalogField)[]> {
        return wrapSentryTransaction(
            'CatalogService.searchCatalog',
            {
                projectUuid,
                userAttributesSize: Object.keys(userAttributes).length,
                query,
            },
            async () => {
                const catalog = await wrapSentryTransaction(
                    'CatalogService.searchCatalog.modelSearch',
                    {},
                    async () => this.catalogModel.search(projectUuid, query),
                );

                // Filter required attributes
                return wrapSentryTransaction(
                    'CatalogService.searchCatalog.filterAttributes',
                    {
                        catalogSize: catalog.length,
                    },
                    async () =>
                        catalog.filter((c) =>
                            hasUserAttributes(
                                c.requiredAttributes,
                                userAttributes,
                            ),
                        ),
                );
            },
        );
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
            // On search we don't show explore errors, because they are not indexed
            return this.searchCatalog(projectUuid, search, userAttributes);
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

    async getMetadata(user: SessionUser, projectUuid: string, table: string) {
        // Right now we return the full cached explore based on name
        // We could extract some data to only return what we need instead
        // to make this request more lightweight

        // TODO permissions
        const explore = await this.catalogModel.getMetadata(projectUuid, table);
        const baseTable = explore.tables?.[explore.baseTable];

        const metadata: CatalogMetadata = {
            name: explore.label,
            description: baseTable.description,
            modelName: explore.name,
            source: explore.ymlPath,
            fields: CatalogService.parseFieldsFromCompiledTable(baseTable),
        };
        return metadata;
    }
}
