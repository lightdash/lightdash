import { subject } from '@casl/ability';
import {
    ApiCatalogSearch,
    assertUnreachable,
    CatalogTable,
    CatalogType,
    CompiledField,
    CreateChartValidation,
    CreateDashboardValidation,
    CreateTableValidation,
    CreateValidation,
    DashboardTileTarget,
    Explore,
    ExploreError,
    ForbiddenError,
    getCustomMetricDimensionId,
    getFilterRules,
    getItemId,
    InlineErrorType,
    isDashboardChartTileType,
    isExploreError,
    OrganizationMemberRole,
    RequestMethod,
    SessionUser,
    SummaryExplore,
    TableCalculation,
    TableSelectionType,
    ValidationErrorType,
    ValidationResponse,
    ValidationSourceType,
} from '@lightdash/common';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { LightdashConfig } from '../../config/parseConfig';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { UserAttributesModel } from '../../models/UserAttributesModel';
import { BaseService } from '../BaseService';
import { hasViewAccessToSpace } from '../SpaceService/SpaceService';
import { doesExploreMatchRequiredAttributes } from '../UserAttributesService/UserAttributeUtils';

type CatalogArguments = {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    projectModel: ProjectModel;
    userAttributesModel: UserAttributesModel;
};

export class CatalogService extends BaseService {
    lightdashConfig: LightdashConfig;

    analytics: LightdashAnalytics;

    projectModel: ProjectModel;

    userAttributesModel: UserAttributesModel;

    constructor({
        lightdashConfig,
        analytics,
        projectModel,
        userAttributesModel,
    }: CatalogArguments) {
        super();
        this.lightdashConfig = lightdashConfig;
        this.analytics = analytics;
        this.projectModel = projectModel;
        this.userAttributesModel = userAttributesModel;
    }

    async getCatalog(
        user: SessionUser,
        projectUuid: string,
        { search, onlyTables, onlyFields }: ApiCatalogSearch,
    ) {
        const includeErrors = true;
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

        const allExploreSummaries = explores.reduce<CatalogTable[]>(
            (acc, explore) => {
                if (isExploreError(explore)) {
                    return acc;
                    /* return includeErrors
                        ? [
                              ...acc,
                              {
                                  name: explore.name,
                                  label: explore.label,
                                  tags: explore.tags,
                                  groupLabel: explore.groupLabel,
                                  errors: explore.errors,
                                  databaseName:
                                      explore.baseTable &&
                                      explore.tables?.[explore.baseTable]
                                          ?.database,
                                  schemaName:
                                      explore.baseTable &&
                                      explore.tables?.[explore.baseTable]
                                          ?.schema,
                                  description:
                                      explore.baseTable &&
                                      explore.tables?.[explore.baseTable]
                                          ?.description,
                              },
                          ]
                        : acc; */
                }
                if (
                    doesExploreMatchRequiredAttributes(explore, userAttributes)
                ) {
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
            },
            [],
        );
        /*
        if (filtered) {
            const {
                tableSelection: { type, value },
            } = await this.getTablesConfiguration(user, projectUuid);
            if (type === TableSelectionType.WITH_TAGS) {
                return allExploreSummaries.filter((explore) =>
                    hasIntersection(explore.tags || [], value || []),
                );
            }
            if (type === TableSelectionType.WITH_NAMES) {
                return allExploreSummaries.filter((explore) =>
                    (value || []).includes(explore.name),
                );
            }
        } */

        return allExploreSummaries;
    }
}
