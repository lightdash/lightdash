import { z } from 'zod';
import { type LightdashUser } from '../../types/user';
import assertUnreachable from '../../utils/assertUnreachable';

export type Embed = {
    projectUuid: string;
    encodedSecret: string;
    dashboardUuids: string[];
    createdAt: string;
    user: Pick<LightdashUser, 'userUuid' | 'firstName' | 'lastName'>;
};

export type DecodedEmbed = Omit<Embed, 'encodedSecret'> & {
    encodedSecret: undefined;
    secret: string;
};

export type CreateEmbed = {
    dashboardUuids: string[];
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
    allowedFilters: z.array(z.string()).optional(),
});

export type DashboardFilterInteractivityOptions = z.infer<
    typeof DashboardFilterInteractivityOptionsSchema
>;

export const InteractivityOptionsSchema = z.object({
    dashboardFiltersInteractivity:
        DashboardFilterInteractivityOptionsSchema.optional(),
    canExportCsv: z.boolean().optional(),
    canExportImages: z.boolean().optional(),
});

export type InteractivityOptions = z.infer<typeof InteractivityOptionsSchema>;

export const EmbedJwtSchema = z
    .object({
        userAttributes: z.record(z.unknown()).optional(),
        user: z
            .object({
                externalId: z.string().optional(),
                email: z.string().optional(),
            })
            .optional(),
        content: z
            .object({
                type: z.literal('dashboard'),
                dashboardUuid: z.string(),
                isPreview: z.boolean().optional(),
            })
            .merge(InteractivityOptionsSchema),
        iat: z.number().optional(),
        exp: z.number(),
    })
    .describe(
        'Configuration file for generating a CSV file from a query with metrics and dimensions',
    );

export type EmbedJwt = z.infer<typeof EmbedJwtSchema>;

// Note: we can't extend zod types since tsoa doesn't support it
export type CreateEmbedJwt = {
    content: {
        type: 'dashboard';
        dashboardUuid: string;
        isPreview?: boolean;
        dashboardFiltersInteractivity?: {
            enabled: FilterInteractivityValues | boolean;
            allowedFilters?: string[];
        };
        canExportCsv?: boolean;
        canExportImages?: boolean;
    };
    userAttributes?: { [key: string]: string };
    user?: {
        email?: string;
        externalId?: string;
    };
    expiresIn?: string;
};

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
