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
    getBasicType,
    isDimension,
    isExploreError,
    SessionUser,
    UserAttributeValueMap,
} from '@lightdash/common';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { LightdashConfig } from '../../config/parseConfig';
import { CatalogModel } from '../../models/CatalogModel/CatalogModel';
import { parseFieldsFromCompiledTable } from '../../models/CatalogModel/utils/parser';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { UserAttributesModel } from '../../models/UserAttributesModel';
import { wrapSentryTransaction } from '../../utils';
import { BaseService } from '../BaseService';
import {
    doesExploreMatchRequiredAttributes,
    getFilteredExplore,
    hasUserAttributes,
} from '../UserAttributesService/UserAttributeUtils';

export type CatalogArguments<T extends CatalogModel = CatalogModel> = {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    projectModel: ProjectModel;
    userAttributesModel: UserAttributesModel;
    catalogModel: T;
};

export class CatalogService<
    T extends CatalogModel = CatalogModel,
> extends BaseService {
    lightdashConfig: LightdashConfig;

    analytics: LightdashAnalytics;

    projectModel: ProjectModel;

    userAttributesModel: UserAttributesModel;

    catalogModel: T;

    constructor({
        lightdashConfig,
        analytics,
        projectModel,
        userAttributesModel,
        catalogModel,
    }: CatalogArguments<T>) {
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
                ).flatMap((t) => parseFieldsFromCompiledTable(t));

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
                        joinedTables: explore.joinedTables,
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
                        joinedTables: explore.joinedTables,
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
                    async () =>
                        this.catalogModel.search({
                            projectUuid,
                            searchQuery: query,
                        }),
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
        const explore = await this.catalogModel.getMetadata(projectUuid, table);

        const userAttributes =
            await this.userAttributesModel.getAttributeValuesForOrgMember({
                organizationUuid,
                userUuid: user.userUuid,
            });

        if (!doesExploreMatchRequiredAttributes(explore, userAttributes)) {
            throw new ForbiddenError(
                `You don't have access to the explore ${explore.name}`,
            );
        }

        const baseTable = explore.tables?.[explore.baseTable];
        const fields = parseFieldsFromCompiledTable(baseTable);
        const filteredFields = fields.filter((field) =>
            hasUserAttributes(field.requiredAttributes, userAttributes),
        );
        const metadata: CatalogMetadata = {
            name: explore.label,
            description: baseTable.description,
            modelName: explore.name,
            source: explore.ymlPath,
            fields: filteredFields,
        };
        return metadata;
    }
}
