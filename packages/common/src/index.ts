import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { z } from 'zod';
import { type AnyType } from './types/any';
import { LightdashMode } from './types/api';
import { type Explore } from './types/explore';
import {
    DimensionType,
    friendlyName,
    isCustomDimension,
    isDimension,
    isField,
    isFilterableDimension,
    isMetric,
    isTableCalculation,
    type CompiledField,
    type CustomDimension,
    type Dimension,
    type Field,
    type FieldId,
    type FilterableDimension,
    type ItemsMap,
    type Metric,
    type TableCalculation,
} from './types/field';
import { type AdditionalMetric, type MetricQuery } from './types/metricQuery';
import { OrganizationMemberRole } from './types/organizationMemberProfile';
import {
    DbtProjectType,
    ProjectType,
    type DbtProjectConfig,
} from './types/projects';
import { type ResultRow } from './types/results';
import { type Series } from './types/savedCharts';
import { SpaceMemberRole, type CreateSpace } from './types/space';
import { TimeFrames } from './types/timeFrames';
import { convertAdditionalMetric } from './utils/additionalMetrics';
import { getFields } from './utils/fields';
import { formatItemValue } from './utils/formatting';
import { getItemId, getItemLabelWithoutTableName } from './utils/item';
import { getOrganizationNameSchema } from './utils/organization';
import type { PivotValuesColumn } from './visualizations/types';

dayjs.extend(utc);
export * from './authorization/buildAccountHelpers';
export {
    defineUserAbility,
    getUserAbilityBuilder,
    JWT_HEADER_NAME,
} from './authorization/index';
export * from './authorization/jwtAbility';
export * from './authorization/parseAccount';
export * from './authorization/roleToScopeMapping';
export * from './authorization/scopes';
export * from './authorization/serviceAccountAbility';
export * from './authorization/types';
export * from './compiler/compilationReport';
export * from './compiler/exploreCompiler';
export * from './compiler/filtersCompiler';
export * from './compiler/lightdashModelConverter';
export * from './compiler/parameters';
export * from './compiler/translator';
export * from './constants/sessionStorageKeys';
export * from './constants/sqlRunner';
export { default as DbtSchemaEditor } from './dbt/DbtSchemaEditor/DbtSchemaEditor';
export * from './dbt/validation';
export * from './ee';
export * from './pivot/derivePivotConfigFromChart';
export * from './pivot/pivotConfig';
export * from './pivot/pivotQueryResults';
export * from './pivot/utils';
export { default as chartAsCodeSchema } from './schemas/json/chart-as-code-1.0.json';
export { default as dashboardAsCodeSchema } from './schemas/json/dashboard-as-code-1.0.json';
export { default as lightdashDbtYamlSchema } from './schemas/json/lightdash-dbt-2.0.json';
export { default as lightdashProjectConfigSchema } from './schemas/json/lightdash-project-config-1.0.json';
export { default as modelAsCodeSchema } from './schemas/json/model-as-code-1.0.json';
export * from './templating/template';
export * from './types/account';
export * from './types/analytics';
export * from './types/any';
export * from './types/api';
export * from './types/api/comments';
export * from './types/api/errors';
export * from './types/api/notifications';
export * from './types/api/paginatedQuery';
export * from './types/api/parameters';
export * from './types/api/share';
export * from './types/api/sort';
export * from './types/api/spotlight';
export * from './types/api/success';
export * from './types/api/uuid';
export * from './types/auth';
export * from './types/bigQuerySSO';
export * from './types/catalog';
export * from './types/changeset';
export * from './types/coder';
export * from './types/comments';
export * from './types/conditionalFormatting';
export * from './types/content';
export * from './types/csv';
export * from './types/dashboard';
export * from './types/dbt';
export * from './types/downloadFile';
export * from './types/email';
export * from './types/errors';
export * from './types/explore';
export * from './types/featureFlags';
export * from './types/field';
export * from './types/fieldMatch';
export * from './types/filter';
export * from './types/gdrive';
export * from './types/gitIntegration';
export * from './types/groups';
export * from './types/job';
export * from './types/knex-paginate';
export * from './types/lightdashModel';
export * from './types/lightdashProjectConfig';
export * from './types/metricQuery';
export * from './types/metricsExplorer';
export * from './types/notifications';
export * from './types/oauth';
export * from './types/openIdIdentity';
export * from './types/organization';
export * from './types/organizationMemberProfile';
export * from './types/organizationWarehouseCredentials';
export * from './types/paginateResults';
export * from './types/parameters';
export * from './types/periodOverPeriodComparison';
export * from './types/personalAccessToken';
export * from './types/pinning';
export * from './types/pivot';
export * from './types/projectCompileLogs';
export * from './types/projectGroupAccess';
export * from './types/projectMemberProfile';
export * from './types/projectMemberRole';
export * from './types/projects';
export * from './types/promotion';
export * from './types/queryHistory';
export * from './types/rename';
export * from './types/resourceViewItem';
export * from './types/results';
export * from './types/roles';
export * from './types/savedCharts';
export * from './types/scheduler';
export * from './types/schedulerLog';
export * from './types/schedulerTaskList';
export * from './types/scopes';
export * from './types/search';
export * from './types/share';
export * from './types/slack';
export * from './types/slackSettings';
export * from './types/space';
export * from './types/spotlightTableConfig';
export * from './types/sqlRunner';
export * from './types/SshKeyPair';
export * from './types/table';
export * from './types/tags';
export * from './types/timeFrames';
export * from './types/timezone';
export * from './types/user';
export * from './types/userAttributes';
export * from './types/userWarehouseCredentials';
export * from './types/validation';
export * from './types/warehouse';
export * from './types/yamlSchema';
export * from './utils/accessors';
export * from './utils/additionalMetrics';
export * from './utils/api';
export { default as assertUnreachable } from './utils/assertUnreachable';
export * from './utils/catalogMetricsTree';
export * from './utils/changeset';
export * from './utils/charts';
export * from './utils/colors';
export * from './utils/conditionalFormatExpressions';
export * from './utils/conditionalFormatting';
export * from './utils/convertCustomDimensionsToYaml';
export * from './utils/convertCustomMetricsToYaml';
export * from './utils/customDimensions';
export * from './utils/dashboard';
export * from './utils/dbt';
export * from './utils/dependencyGraph';
export * from './utils/email';
export * from './utils/fields';
export * from './utils/filters';
export * from './utils/formatting';
export * from './utils/github';
export * from './utils/i18n/chartAsCode';
export * from './utils/i18n/dashboardAsCode';
export * from './utils/i18n/merge';
export * from './utils/i18n/types';
export * from './utils/item';
export * from './utils/loadLightdashProjectConfig';
export * from './utils/metricsExplorer';
export * from './utils/oauth';
export * from './utils/organization';
export * from './utils/projectMemberRole';
export * from './utils/promises';
export * from './utils/sanitizeHtml';
export * from './utils/scheduler';
export * from './utils/searchParams';
export * from './utils/sleep';
export * from './utils/slugs';
export * from './utils/subtotals';
export * from './utils/time';
export * from './utils/timeFrames';
export * from './utils/virtualView';
export * from './utils/warehouse';
export * from './visualizations/CartesianChartDataModel';
export * from './visualizations/helpers/getCartesianAxisFormatterConfig';
export * from './visualizations/helpers/styles/axisStyles';
export * from './visualizations/helpers/styles/barChartStyles';
export * from './visualizations/helpers/styles/gridStyles';
export * from './visualizations/helpers/styles/legendStyles';
export * from './visualizations/helpers/styles/pieChartStyles';
export * from './visualizations/helpers/styles/referenceLineStyles';
export * as vizThemeColors from './visualizations/helpers/styles/themeColors';
export * from './visualizations/helpers/styles/tooltipStyles';
export * from './visualizations/helpers/styles/valueLabelStyles';
export * from './visualizations/helpers/tooltipFormatter';
export * from './visualizations/helpers/valueFormatter';
export * from './visualizations/PieChartDataModel';
export * from './visualizations/TableDataModel';
export * from './visualizations/types';
export * from './visualizations/types/IResultsRunner';

export const validateEmail = (email: string): boolean => {
    if (/\s/.test(email)) {
        return false;
    }

    const re =
        /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    return re.test(String(email).toLowerCase());
};

export const getEmailSchema = () =>
    z
        .string()
        .refine((email) => validateEmail(email), {
            message: 'Email address is not valid',
        })
        .refine((email) => !/\s/.test(email), {
            message: 'Email address must not contain whitespaces',
        });

export const getPasswordSchema = () =>
    z
        .string()
        .min(8, { message: 'must be at least 8 characters long' })
        .regex(/[a-zA-Z]/, { message: 'must contain a letter' })
        .regex(/[\d\W_]/, { message: 'must contain a number or symbol' });

export const validatePassword = (password: string): boolean =>
    getPasswordSchema().safeParse(password).success;

export const hasIntersection = (tags: string[], tags2: string[]): boolean => {
    const intersection = tags.filter((value) => tags2.includes(value));
    return intersection.length > 0;
};

export const toggleArrayValue = <T = string>(
    initialArray: T[],
    value: T,
): T[] => {
    const array = [...initialArray];
    const index = array.indexOf(value);
    if (index === -1) {
        array.push(value);
    } else {
        array.splice(index, 1);
    }
    return array;
};

export const replaceStringInArray = (
    arrayToUpdate: string[],
    valueToReplace: string,
    newValue: string,
) =>
    arrayToUpdate.map((value) => (value === valueToReplace ? newValue : value));

export type SqlResultsRow = { [columnName: string]: unknown };
export type SqlResultsField = { name: string; type: string }; // TODO: standardise column types
export type SqlQueryResults = {
    fields: SqlResultsField[]; // TODO: standard column types
    rows: SqlResultsRow[];
};

export function hexToRGB(hex: string, alpha: number | undefined): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);

    if (alpha !== undefined) {
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    return `rgb(${r}, ${g}, ${b})`;
}

// Seeds

export const SEED_ORG_1 = {
    organization_uuid: '172a2270-000f-42be-9c68-c4752c23ae51',
    organization_name: 'Jaffle Shop',
};

export const SEED_ORG_1_ADMIN = {
    user_uuid: 'b264d83a-9000-426a-85ec-3f9c20f368ce',
    first_name: 'David',
    last_name: 'Attenborough',
    is_marketing_opted_in: true,
    is_tracking_anonymized: false,
    is_setup_complete: true,
    is_active: true,
};
export const SEED_ORG_1_ADMIN_EMAIL = {
    email: 'demo@lightdash.com',
    is_primary: true,
};
export const SEED_ORG_1_ADMIN_PASSWORD = {
    password: 'demo_password!',
};
export const SEED_ORG_1_ADMIN_ROLE = OrganizationMemberRole.ADMIN;

export const SEED_ORG_1_EDITOR = {
    user_uuid: '80fb8b59-d6b7-4ed6-b969-9849310f3e53',
    first_name: 'Editor',
    last_name: 'User',
    is_marketing_opted_in: true,
    is_tracking_anonymized: false,
    is_setup_complete: true,
    is_active: true,
};
export const SEED_ORG_1_EDITOR_EMAIL = {
    email: 'demo2@lightdash.com',
    is_primary: true,
};
export const SEED_ORG_1_EDITOR_PASSWORD = {
    password: 'demo_password!',
};
export const SEED_ORG_1_EDITOR_ROLE = OrganizationMemberRole.EDITOR;

export const SEED_ORG_1_VIEWER = {
    user_uuid: 'e0dd2003-c291-4e14-b977-7a03b7edc842',
    first_name: 'Viewer',
    last_name: 'User',
    is_marketing_opted_in: true,
    is_tracking_anonymized: false,
    is_setup_complete: true,
    is_active: true,
};
export const SEED_ORG_1_VIEWER_EMAIL = {
    email: 'demo3@lightdash.com',
    is_primary: true,
};
export const SEED_ORG_1_VIEWER_PASSWORD = {
    password: 'demo_password!',
};
export const SEED_ORG_1_VIEWER_ROLE = OrganizationMemberRole.VIEWER;

// Another user
export const SEED_ORG_2 = {
    organization_uuid: '42339eef-359e-4ec4-b810-54ef0b4e3446',
    organization_name: 'Another Shop',
};
export const SEED_ORG_2_ADMIN = {
    user_uuid: '57cd4548-cbe3-42b3-aa13-97821713e307',
    first_name: 'Another',
    last_name: 'User',
    is_marketing_opted_in: true,
    is_tracking_anonymized: false,
    is_setup_complete: true,
    is_active: true,
};
export const SEED_ORG_2_ADMIN_EMAIL = {
    email: 'another@lightdash.com',
    is_primary: true,
};
export const SEED_ORG_2_ADMIN_PASSWORD = {
    password: 'demo_password!',
};
export const SEED_ORG_2_ADMIN_ROLE = OrganizationMemberRole.ADMIN;
export const SEED_EMBED_SECRET = 'zU3h50saDOO20czNFNRok';

export const SEED_PROJECT = {
    project_uuid: '3675b69e-8324-4110-bdca-059031aa8da3',
    name: 'Jaffle shop',
    project_type: ProjectType.DEFAULT,
    dbt_connection_type: DbtProjectType.DBT,
    dbt_connection: null,
    copied_from_project_uuid: null,
    organization_warehouse_credentials_uuid: null,
};
export const SEED_SPACE = {
    name: SEED_PROJECT.name,
};

export const SEED_GROUP = {
    groupUuid: '9d615ede-5758-4954-9fb9-2a07fc415ba5',
    name: 'Org 1 Group',
};

export const SEED_GROUP_2 = {
    groupUuid: '1456c265-f375-4d64-bd33-105c84ad9b5d',
    name: 'Org 1 Editor Group',
};

export type ArgumentsOf<F extends Function> = F extends (
    ...args: infer A
) => AnyType
    ? A
    : never;

export const getVisibleFields = (explore: Explore): CompiledField[] =>
    getFields(explore).filter(({ hidden }) => !hidden);

export const findFieldByIdInExplore = (
    explore: Explore,
    id: FieldId,
): Field | undefined =>
    getFields(explore).find((field) => getItemId(field) === id);

export const snakeCaseName = (text: string): string =>
    text
        .replace(/\W+/g, ' ')
        .split(/ |\B(?=[A-Z])/)
        .map((word) => word.toLowerCase())
        .join('_');

export const hasSpecialCharacters = (text: string) => /[^a-zA-Z ]/g.test(text);

export const CompleteUserSchema = z.object({
    organizationName: getOrganizationNameSchema().optional(),
    jobTitle: z.string().min(0),
    enableEmailDomainAccess: z.boolean().default(false),
    isMarketingOptedIn: z.boolean().default(true),
    isTrackingAnonymized: z.boolean().default(false),
});

export type CompleteUserArgs = z.infer<typeof CompleteUserSchema>;

export const isLightdashMode = (x: string): x is LightdashMode =>
    Object.values<string>(LightdashMode).includes(x);

export enum LightdashInstallType {
    DOCKER_IMAGE = 'docker_image',
    BASH_INSTALL = 'bash_install',
    HEROKU = 'heroku',
    UNKNOWN = 'unknown',
}

export const getResultValueArray = (
    rows: ResultRow[],
    preferRaw: boolean = false,
    calculateMinAndMax: boolean = false,
    excludeNulls: boolean = false,
): {
    results: Record<string, unknown>[];
    minsAndMaxes?: Record<string, { min: number; max: number }>;
} => {
    const minMax: Record<string, { min: number; max: number }> = {};

    const results = rows.map((row) =>
        Object.keys(row).reduce<Record<string, unknown>>((acc, key) => {
            if (excludeNulls && row[key]?.value.raw === null) {
                return acc;
            }
            const rawWithFallback =
                row[key]?.value.raw ?? row[key]?.value.formatted; // using nullish coalescing operator to handle null and undefined only
            const formattedWithFallback =
                row[key]?.value.formatted || row[key]?.value.raw;

            const value = preferRaw ? rawWithFallback : formattedWithFallback;

            acc[key] = value;

            if (calculateMinAndMax) {
                const numericValue = Number(value);
                if (!Number.isNaN(numericValue)) {
                    if (!minMax[key]) {
                        minMax[key] = { min: numericValue, max: numericValue };
                    } else {
                        minMax[key].min = Math.min(
                            minMax[key].min,
                            numericValue,
                        );
                        minMax[key].max = Math.max(
                            minMax[key].max,
                            numericValue,
                        );
                    }
                }
            }

            return acc;
        }, {}),
    );

    return calculateMinAndMax ? { results, minsAndMaxes: minMax } : { results };
};

export const getDateGroupLabel = (axisItem: ItemsMap[string]) => {
    if (
        isDimension(axisItem) &&
        [DimensionType.DATE, DimensionType.TIMESTAMP].includes(axisItem.type) &&
        (axisItem.group || (axisItem.groups && axisItem.groups.length > 0)) &&
        axisItem.label &&
        axisItem.timeInterval
    ) {
        const timeFrame =
            TimeFrames[axisItem.timeInterval]?.toLowerCase() || '';

        if (timeFrame && axisItem.label.endsWith(` ${timeFrame}`)) {
            // Remove the time frame from the end of the label - e.g. from 'Order created day' to 'Order created'.
            return getItemLabelWithoutTableName(axisItem).replace(
                new RegExp(`\\s+${timeFrame}$`),
                '',
            );
        }

        return friendlyName(axisItem.label);
    }

    return undefined;
};

export const getAxisName = ({
    isAxisTheSameForAllSeries,
    selectedAxisIndex,
    axisReference,
    axisIndex,
    axisName,
    series,
    itemsMap,
}: {
    isAxisTheSameForAllSeries: boolean;
    selectedAxisIndex: number;
    axisReference: 'yRef' | 'xRef';
    axisIndex: number;
    axisName?: string;
    series?: Series[];
    itemsMap: ItemsMap | undefined;
}): string | undefined => {
    const itemIndex = (series || [])[0]?.encode[axisReference].field;
    const defaultItem = itemsMap && itemIndex ? itemsMap[itemIndex] : undefined;
    const dateGroupName = defaultItem
        ? getDateGroupLabel(defaultItem)
        : undefined;
    const fallbackSeriesName: string | undefined =
        series && series.length === 1
            ? series[0]?.name ||
              (defaultItem && getItemLabelWithoutTableName(defaultItem))
            : undefined;

    return !isAxisTheSameForAllSeries || selectedAxisIndex === axisIndex
        ? axisName || dateGroupName || fallbackSeriesName
        : undefined;
};

export function getFieldMap(
    explore: Explore,
    additionalMetrics: AdditionalMetric[] = [],
): Record<string, CompiledField | AdditionalMetric> {
    return [...getFields(explore), ...additionalMetrics].reduce(
        (sum, field) => ({
            ...sum,
            [getItemId(field)]: field,
        }),
        {},
    );
}

export function getItemMap(
    explore: Explore,
    additionalMetrics: AdditionalMetric[] = [],
    tableCalculations: TableCalculation[] = [],
    customDimensions: CustomDimension[] = [],
): ItemsMap {
    const convertedAdditionalMetrics = (additionalMetrics || []).reduce<
        Metric[]
    >((acc, additionalMetric) => {
        const table = explore.tables[additionalMetric.table];
        if (table) {
            const metric = convertAdditionalMetric({
                additionalMetric,
                table,
            });
            acc.push(metric);
        }
        return acc;
    }, []);
    return [
        ...getFields(explore),
        ...convertedAdditionalMetrics,
        ...tableCalculations,
        ...customDimensions,
    ].reduce((acc, item) => {
        acc[getItemId(item)] = item;
        return acc;
    }, {} as ItemsMap);
}

export const getDimensionsFromItemsMap = (itemsMap: ItemsMap) =>
    Object.entries(itemsMap).reduce<
        Record<string, Dimension | CustomDimension>
    >((acc, [key, value]) => {
        if (isDimension(value) || isCustomDimension(value)) {
            return { ...acc, [key]: value };
        }
        return acc;
    }, {});

export const getFilterableDimensionsFromItemsMap = (itemsMap: ItemsMap) =>
    Object.entries(itemsMap).reduce<Record<string, FilterableDimension>>(
        (acc, [key, value]) => {
            if (isDimension(value) && isFilterableDimension(value)) {
                return { ...acc, [key]: value };
            }
            return acc;
        },
        {},
    );

export const getMetricsFromItemsMap = (
    itemsMap: ItemsMap,
    filter: (value: ItemsMap[string]) => boolean = () => true,
) =>
    Object.entries(itemsMap).reduce<Record<string, Metric>>(
        (acc, [key, value]) => {
            if (isField(value) && isMetric(value) && filter(value)) {
                return { ...acc, [key]: value };
            }
            return acc;
        },
        {},
    );

export const getTableCalculationsFromItemsMap = (itemsMap?: ItemsMap) =>
    Object.entries(itemsMap ?? {}).reduce<Record<string, TableCalculation>>(
        (acc, [key, value]) => {
            if (isTableCalculation(value)) {
                return { ...acc, [key]: value };
            }
            return acc;
        },
        {},
    );

export function itemsInMetricQuery(
    metricQuery: MetricQuery | undefined,
): string[] {
    return metricQuery === undefined
        ? []
        : [
              ...metricQuery.metrics,
              ...metricQuery.dimensions,
              ...(metricQuery.tableCalculations || []).map((tc) => tc.name),
          ];
}

export function formatRawValue(
    field: Field | Metric | TableCalculation | CustomDimension | undefined,
    value: AnyType,
) {
    const isTimestamp =
        isField(field) &&
        (field.type === DimensionType.DATE ||
            field.type === DimensionType.TIMESTAMP);

    if (isTimestamp && value !== null) {
        // We want to return the datetime in UTC to avoid timezone issues in the frontend like in chart tooltips
        return dayjs(value).utc(true).format();
    }

    return value;
}

// ! We format raw values so we can't use the values directly from the warehouse to compare with subtotals of date dimensions
export function formatRawRows(
    rows: { [col: string]: AnyType }[],
    itemsMap: ItemsMap,
): Record<string, unknown>[] {
    return rows.map((row) => {
        const resultRow: ResultRow = {};
        const columnNames = Object.keys(row || {});

        for (const columnName of columnNames) {
            const value = row[columnName];
            const item = itemsMap[columnName];

            resultRow[columnName] = formatRawValue(item, value);
        }

        return resultRow;
    });
}

export function formatRow(
    row: { [col: string]: AnyType },
    itemsMap: ItemsMap,
    pivotValuesColumns?: Record<string, PivotValuesColumn> | null,
    parameters?: Record<string, unknown>,
): ResultRow {
    const resultRow: ResultRow = {};
    const columnNames = Object.keys(row || {});

    for (const columnName of columnNames) {
        const value = row[columnName];
        const pivotValuesColumn = pivotValuesColumns?.[columnName];
        const item = itemsMap[pivotValuesColumn?.referenceField ?? columnName];

        resultRow[columnName] = {
            value: {
                raw: formatRawValue(item, value),
                formatted: formatItemValue(item, value, false, parameters),
            },
        };
    }

    return resultRow;
}

export function formatRows(
    rows: { [col: string]: AnyType }[],
    itemsMap: ItemsMap,
    pivotValuesColumns?: Record<string, PivotValuesColumn> | null,
    parameters?: Record<string, unknown>,
): ResultRow[] {
    return rows.map((row) =>
        formatRow(row, itemsMap, pivotValuesColumns, parameters),
    );
}

const isObject = (object: AnyType) =>
    object != null && typeof object === 'object';
export const removeEmptyProperties = (object: Record<string, AnyType>) => {
    const newObj: Record<string, AnyType> = {};
    Object.keys(object).forEach((key) => {
        if (object[key] === Object(object[key]))
            newObj[key] = removeEmptyProperties(object[key]);
        else if (object[key] !== undefined && object[key] !== null)
            newObj[key] = object[key];
    });
    return newObj;
};
export const deepEqual = (
    object1: Record<string, AnyType>,
    object2: Record<string, AnyType>,
): boolean => {
    const keys1 = Object.keys(object1);
    const keys2 = Object.keys(object2);
    if (keys1.length !== keys2.length) {
        return false;
    }
    return keys1.every((key) => {
        const val1: AnyType = object1[key];
        const val2: AnyType = object2[key];
        const areObjects = isObject(val1) && isObject(val2);
        return !(
            (areObjects && !deepEqual(val1, val2)) ||
            (!areObjects && val1 !== val2)
        );
    });
};

export const getProjectDirectory = (
    dbtConnection?: DbtProjectConfig,
): string | undefined => {
    if (!dbtConnection) return undefined;

    switch (dbtConnection.type) {
        case DbtProjectType.DBT:
            return dbtConnection.project_dir;
        case DbtProjectType.GITHUB:
        case DbtProjectType.GITLAB:
        case DbtProjectType.BITBUCKET:
        case DbtProjectType.AZURE_DEVOPS:
            return dbtConnection.project_sub_path;
        case DbtProjectType.DBT_CLOUD_IDE:
        case DbtProjectType.NONE:
            return undefined;
        default:
            return undefined;
    }
};

export function isNotNull<T>(arg: T): arg is Exclude<T, null> {
    return arg !== null;
}

export type TreeCreateSpace = CreateSpace & {
    children?: TreeCreateSpace[];
    groupAccess?: {
        groupUuid: string;
        role: SpaceMemberRole;
    }[];
};

export const SPACE_TREE_1: TreeCreateSpace[] = [
    {
        name: 'Parent Space 1',
        children: [
            {
                name: 'Child Space 1.1',
                children: [
                    {
                        name: 'Grandchild Space 1.1.1',
                    },
                    {
                        name: 'Grandchild Space 1.1.2',
                    },
                ],
            },
            {
                name: 'Child Space 1.2',
                children: [
                    {
                        name: 'Grandchild Space 1.2.1',
                    },
                    {
                        name: 'Grandchild Space 1.2.2',
                        children: [
                            {
                                name: 'Great Grandchild Space 1.2.2.1',
                            },
                        ],
                    },
                ],
            },
            {
                name: 'Child Space 1.3',
                children: [
                    {
                        name: 'Grandchild Space 1.3.1',
                        children: [
                            {
                                name: 'Great Grandchild Space 1.3.1.1',
                            },
                        ],
                    },
                ],
            },
        ],
    },
    {
        name: 'Parent Space 2',
        isPrivate: true,
        children: [
            {
                name: 'Child Space 2.1',
                children: [
                    {
                        name: 'Grandchild Space 2.1.1',
                    },
                ],
            },
        ],
    },
    {
        name: 'Parent Space 3',
        isPrivate: true,
        access: [
            // Admin will automatically be added, we only seed editor
            {
                userUuid: SEED_ORG_1_EDITOR.user_uuid,
                role: SpaceMemberRole.EDITOR,
            },
        ],
        children: [
            {
                name: 'Child Space 3.1',
            },
        ],
    },
    // Created by admin and added group access
    {
        name: 'Parent Space 5',
        isPrivate: true,
        access: [],
        groupAccess: [
            {
                groupUuid: SEED_GROUP_2.groupUuid,
                role: SpaceMemberRole.EDITOR,
            },
        ],
        children: [
            {
                name: 'Child Space 5.1',
            },
        ],
    },
] as const;

export const SPACE_TREE_2: TreeCreateSpace[] = [
    {
        name: 'Parent Space 4',
        isPrivate: true,
        access: [],
        children: [
            {
                name: 'Child Space 4.1',
            },
        ],
    },
] as const;
