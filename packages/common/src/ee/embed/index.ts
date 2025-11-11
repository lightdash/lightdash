import { z } from 'zod';
import type { EmbedContent, OssEmbed } from '../../types/auth';
import assertUnreachable from '../../utils/assertUnreachable';

/** @deprecated Use OssEmbed instead */
export type Embed = OssEmbed;

export type DecodedEmbed = Omit<Embed, 'encodedSecret'> & {
    encodedSecret: undefined;
    secret: string;
};

// tsoa can't differentiate between CreateEmbed and CreatedEmbedJwt so we opt for a more unique name
// At least one of dashboardUuids or chartUuids must be provided
export type CreateEmbedRequestBody = {
    dashboardUuids?: string[];
    chartUuids?: string[];
};

export type UpdateEmbed = {
    dashboardUuids: string[];
    allowAllDashboards: boolean;
    // TODO: Make these required in Settings UI PR
    chartUuids?: string[];
    allowAllCharts?: boolean;
};

export enum FilterInteractivityValues {
    some = 'some',
    all = 'all',
    none = 'none',
}

export const FilterInteractivityValuesSchema = z.enum([
    FilterInteractivityValues.some,
    FilterInteractivityValues.all,
    FilterInteractivityValues.none,
]);

export const DashboardFilterInteractivityOptionsSchema = z.object({
    enabled: z.union([z.boolean(), FilterInteractivityValuesSchema]),
    // Nullish because we have python clients that serialize None to null
    allowedFilters: z.array(z.string()).nullish(),
    hidden: z.boolean().optional(),
});

export type DashboardFilterInteractivityOptions = z.infer<
    typeof DashboardFilterInteractivityOptionsSchema
>;

export const ParameterInteractivityOptionsSchema = z.object({
    enabled: z.boolean(),
});

export type ParameterInteractivityOptions = z.infer<
    typeof ParameterInteractivityOptionsSchema
>;

export const InteractivityOptionsSchema = z.object({
    dashboardFiltersInteractivity:
        DashboardFilterInteractivityOptionsSchema.optional(),
    parameterInteractivity: ParameterInteractivityOptionsSchema.optional(),
    canExportCsv: z.boolean().optional(),
    canExportImages: z.boolean().optional(),
    canExportPagePdf: z.boolean().optional(),
    canDateZoom: z.boolean().optional(),
    canExplore: z.boolean().optional(),
    canViewUnderlyingData: z.boolean().optional(),
});

export type InteractivityOptions = z.infer<typeof InteractivityOptionsSchema>;

export const ChartInteractivityOptionsSchema = z.object({
    scopes: z.array(z.string()).optional(),
    canExportCsv: z.boolean().optional(),
    canExportImages: z.boolean().optional(),
    canViewUnderlyingData: z.boolean().optional(),
});

export type ChartInteractivityOptions = z.infer<
    typeof ChartInteractivityOptionsSchema
>;

export const EmbedJwtSchema = z
    .object({
        userAttributes: z.record(z.unknown()).optional(),
        user: z
            .object({
                externalId: z.string().optional(),
                email: z.string().optional(),
            })
            .optional(),
        content: z.union([
            z
                .object({
                    type: z.literal('dashboard'),
                    projectUuid: z.string().optional(),
                    dashboardUuid: z.string(),
                    isPreview: z.boolean().optional(),
                })
                .merge(InteractivityOptionsSchema),
            z
                .object({
                    type: z.literal('dashboard'),
                    projectUuid: z.string().optional(),
                    dashboardSlug: z.string(),
                    isPreview: z.boolean().optional(),
                })
                .merge(InteractivityOptionsSchema),
            z
                .object({
                    type: z.literal('chart'),
                    projectUuid: z.string().optional(),
                    contentId: z.string(),
                    isPreview: z.boolean().optional(),
                })
                .merge(ChartInteractivityOptionsSchema),
        ]),
        iat: z.number().optional(),
        exp: z.number(),
    })
    .describe(
        'Configuration file for generating a CSV file from a query with metrics and dimensions',
    );

export type EmbedJwt = z.infer<typeof EmbedJwtSchema>;

// Note: we can't extend zod types since tsoa doesn't support it
export type CommonEmbedJwtContent = {
    type: 'dashboard';
    projectUuid?: string;
    isPreview?: boolean;
    dashboardFiltersInteractivity?: {
        enabled: FilterInteractivityValues | boolean;
        allowedFilters?: string[] | null;
        // Should the filters be rendered hidden or visible in the UI
        hidden?: boolean;
    };
    parameterInteractivity?: {
        enabled: boolean;
    };
    canExportCsv?: boolean;
    canExportImages?: boolean;
    canDateZoom?: boolean;
    canExportPagePdf?: boolean;
    canExplore?: boolean;
    canViewUnderlyingData?: boolean;
};

type CommonChartEmbedJwtContent = {
    type: 'chart';
    projectUuid?: string;
    isPreview?: boolean;
    scopes?: string[];
    dashboardFiltersInteractivity?: undefined;
    parameterInteractivity?: undefined;
    canExportCsv?: boolean;
    canExportImages?: boolean;
    canViewUnderlyingData?: boolean;
};

type EmbedJwtContentDashboardUuid = CommonEmbedJwtContent & {
    dashboardUuid: string;
};

type EmbedJwtContentDashboardSlug = CommonEmbedJwtContent & {
    dashboardSlug: string;
};

export type EmbedJwtContentChart = CommonChartEmbedJwtContent & {
    contentId: string;
};

export type CreateEmbedJwt = {
    content:
        | EmbedJwtContentDashboardUuid
        | EmbedJwtContentDashboardSlug
        | EmbedJwtContentChart;
    userAttributes?: { [key: string]: string };
    user?: {
        email?: string;
        externalId?: string;
    };
    expiresIn?: string;
    iat?: number;
    exp?: number;
};

export function isDashboardUuidContent(
    content: CreateEmbedJwt['content'],
): content is EmbedJwtContentDashboardUuid {
    return content.type === 'dashboard' && 'dashboardUuid' in content;
}

export function isDashboardSlugContent(
    content: CreateEmbedJwt['content'],
): content is EmbedJwtContentDashboardSlug {
    return content.type === 'dashboard' && 'dashboardSlug' in content;
}

export function isChartContent(
    content: CreateEmbedJwt['content'],
): content is EmbedJwtContentChart {
    return content.type === 'chart';
}

export function isDashboardContent(
    content: CreateEmbedJwt['content'] | EmbedContent,
): content is EmbedJwtContentDashboardUuid | EmbedJwtContentDashboardSlug {
    return content.type === 'dashboard';
}

export type EmbedUrl = {
    url: string;
};

// allows for backwards compatibility with old filter interactivity boolean values
export function getFilterInteractivityValue(
    enabled: DashboardFilterInteractivityOptions['enabled'],
) {
    if (typeof enabled === 'boolean') {
        return enabled
            ? FilterInteractivityValues.all
            : FilterInteractivityValues.none;
    }

    return enabled;
}

export function isFilterInteractivityEnabled(
    filterInteractivityOptions?: DashboardFilterInteractivityOptions,
) {
    if (!filterInteractivityOptions) return false;

    const filterInteractivityValue = getFilterInteractivityValue(
        filterInteractivityOptions.enabled,
    );

    switch (filterInteractivityValue) {
        case FilterInteractivityValues.some:
            return (
                filterInteractivityOptions.allowedFilters &&
                filterInteractivityOptions.allowedFilters.length > 0
            );
        case FilterInteractivityValues.all:
            return true;
        case FilterInteractivityValues.none:
            return false;
        default:
            return assertUnreachable(
                filterInteractivityValue,
                `Unknown FilterInteractivityValue ${filterInteractivityValue}`,
            );
    }
}

export function isParameterInteractivityEnabled(
    parameterInteractivityOptions?: ParameterInteractivityOptions,
): boolean {
    return parameterInteractivityOptions?.enabled ?? false;
}
