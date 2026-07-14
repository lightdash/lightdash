import { type ApiSuccess } from '../../types/api/success';

/**
 * The kind of file inside an organization design. The pipeline uses this
 * to decide where to place the file inside the sandbox (`css/`, `fonts/`,
 * `images/`) and which files to concatenate into the system-prompt skill
 * append (`instruction`).
 */
export const ORGANIZATION_DESIGN_FILE_KINDS = [
    'css',
    'font',
    'image',
    'instruction',
] as const;

export type OrganizationDesignFileKind =
    (typeof ORGANIZATION_DESIGN_FILE_KINDS)[number];

export type ApiOrganizationDesignFile = {
    fileUuid: string;
    kind: OrganizationDesignFileKind;
    filename: string;
    contentType: string;
    sizeBytes: number;
    createdAt: Date;
};

export type ApiOrganizationDesign = {
    designUuid: string;
    organizationUuid: string;
    name: string;
    description: string | null;
    /**
     * Free-text override appended to the agent's effective skill at build
     * time, alongside any uploaded `instruction` markdown files. Empty
     * string is normalised to `null` server-side.
     */
    extraInstructions: string | null;
    isDefault: boolean;
    createdAt: Date;
    updatedAt: Date;
    createdByUserUuid: string | null;
    files: ApiOrganizationDesignFile[];
};

export type CreateOrganizationDesignRequest = {
    name: string;
    description?: string;
};

export type UpdateOrganizationDesignRequest = {
    name?: string;
    description?: string | null;
    extraInstructions?: string | null;
};

export type ApiOrganizationDesignResponse = ApiSuccess<ApiOrganizationDesign>;

export type ApiOrganizationDesignsResponse = ApiSuccess<
    ApiOrganizationDesign[]
>;

export type ApiOrganizationDesignFileResponse =
    ApiSuccess<ApiOrganizationDesignFile>;

/**
 * Guardrails on how large a theme can grow. A theme's files are streamed into
 * the data-app sandbox on every generation, so an oversized theme times out on
 * the copy when a build applies it.
 *
 * The binding constraint is total bytes (large images), NOT file count — a
 * theme with many small text files is cheap, while a handful of big images is
 * not. So we cap aggregate size only; there is intentionally no file-count cap.
 * `MAX_THEME_FILE_BYTES` bounds any single file. Enforced at upload time and
 * re-checked before a build starts.
 */
export const MAX_THEME_TOTAL_BYTES = 100 * 1024 * 1024; // 100 MB across all files
export const MAX_THEME_FILE_BYTES = 10 * 1024 * 1024; // 10 MB per file

export type ThemeLimitViolation = { bytes: number; limit: number };

export const getThemeTotalBytes = (
    files: Pick<ApiOrganizationDesignFile, 'sizeBytes'>[],
): number => files.reduce((sum, f) => sum + f.sizeBytes, 0);

/**
 * Returns the total-size limit if a set of theme files exceeds it, or null
 * when within limits.
 */
export const checkThemeLimits = (
    files: Pick<ApiOrganizationDesignFile, 'sizeBytes'>[],
): ThemeLimitViolation | null => {
    const bytes = getThemeTotalBytes(files);
    if (bytes > MAX_THEME_TOTAL_BYTES) {
        return { bytes, limit: MAX_THEME_TOTAL_BYTES };
    }
    return null;
};

const formatThemeMb = (bytes: number): string =>
    `${Math.round(bytes / (1024 * 1024))} MB`;

export const themeLimitMessage = (
    violation: ThemeLimitViolation,
    themeName: string | null,
): string => {
    const label = themeName ? `Theme "${themeName}"` : 'This theme';
    return `${label} totals ${formatThemeMb(
        violation.bytes,
    )} of assets, above the limit of ${formatThemeMb(
        violation.limit,
    )}. Remove some assets and try again.`;
};
