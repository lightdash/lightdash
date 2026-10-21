import {
    ContentAsCodeType,
    dashboardAsCodeSchema,
    getChartAsCodeBranchSchema,
    SpaceMemberRole,
    type ChartAsCode,
    type DashboardAsCode,
    type SpaceAsCode,
} from '@lightdash/common';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { DEFAULT_SCHEMA, load } from 'js-yaml';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

const MAX_IMPORT_FILE_SIZE = 5 * 1024 * 1024;
const MAX_EXPANDED_YAML_NODES = 50_000;

const readYaml = (source: string): unknown => {
    // In js-yaml v4 this is the safe YAML schema: no JavaScript tags or
    // custom constructors. Keep CLI-compatible merges and timestamps.
    const parsed = load(source, { schema: DEFAULT_SCHEMA });
    let nodes = 0;
    let characters = 0;
    // Aliases can expand a small file exponentially during normalization.
    // Bound the expanded data before handing it to schema validators.
    const normalized = JSON.stringify(parsed, (key, value: unknown) => {
        nodes += 1;
        characters +=
            key.length + (typeof value === 'string' ? value.length : 0);
        if (
            nodes > MAX_EXPANDED_YAML_NODES ||
            characters > MAX_IMPORT_FILE_SIZE
        ) {
            throw new Error(
                'This YAML expands beyond the supported size. Simplify aliases or split the file.',
            );
        }
        if (typeof value === 'number' && !Number.isFinite(value)) {
            throw new Error('YAML numbers must be finite.');
        }
        return value;
    });
    // Empty/comment-only documents remain invalid instead of reaching validators.
    return normalized === undefined ? undefined : JSON.parse(normalized);
};

export type ImportDocument =
    | { type: 'space'; content: SpaceAsCode }
    | { type: 'chart'; content: ChartAsCode }
    | { type: 'dashboard'; content: DashboardAsCode };

export type ImportEntry = {
    id: string;
    fileName: string;
    document: ImportDocument | null;
    status: 'ready' | 'invalid' | 'uploading' | 'success' | 'error' | 'blocked';
    message: string | null;
    warnings: string[];
};

export type ImportResult = { message: string; warnings: string[] };
export type UploadContent = (document: ImportDocument) => Promise<ImportResult>;

const ajv = new Ajv({ allErrors: true, strict: false, allowUnionTypes: true });
addFormats(ajv);
const validateChart = ajv.compile<ChartAsCode>(
    getChartAsCodeBranchSchema(ContentAsCodeType.CHART),
);
const validateDashboard = ajv.compile<DashboardAsCode>(dashboardAsCodeSchema);

const role = z.enum(SpaceMemberRole);
const spaceSchema = z
    .strictObject({
        contentType: z.literal(ContentAsCodeType.SPACE),
        version: z.literal(1).optional(),
        spaceName: z
            .string()
            .refine((value) => value.trim().length > 0, 'Enter a space name.'),
        slug: z.string().regex(/^[a-z0-9-]+(?:\/[a-z0-9-]+)*$/),
        access: z
            .strictObject({
                inheritParentPermissions: z.boolean(),
                projectMemberAccessRole: role.nullable(),
                users: z.array(
                    z.strictObject({
                        email: z.string().trim().toLowerCase().pipe(z.email()),
                        role,
                    }),
                ),
                groups: z.array(
                    z.strictObject({
                        name: z
                            .string()
                            .refine(
                                (value) => value.trim().length > 0,
                                'Enter a group name.',
                            ),
                        role,
                    }),
                ),
            })
            .optional(),
    })
    .refine((value) => !value.access || value.version === 1, {
        message: 'Space access requires version: 1.',
        path: ['version'],
    })
    .superRefine(({ access }, context) => {
        if (!access) return;
        const emails = access.users.map((user) => user.email);
        const groups = access.groups.map((group) => group.name);
        if (new Set(emails).size !== emails.length) {
            context.addIssue({
                code: 'custom',
                path: ['access', 'users'],
                message: 'Each user email must appear only once.',
            });
        }
        if (new Set(groups).size !== groups.length) {
            context.addIssue({
                code: 'custom',
                path: ['access', 'groups'],
                message: 'Each group name must appear only once.',
            });
        }
    });

export const parseImportFile = async (file: File): Promise<ImportEntry> => {
    const entry: ImportEntry = {
        id: uuidv4(),
        fileName: file.name,
        document: null,
        status: 'invalid',
        message: null,
        warnings: [],
    };
    try {
        if (!/\.ya?ml$/i.test(file.name)) {
            throw new Error('Choose a .yml or .yaml file.');
        }
        if (file.size > MAX_IMPORT_FILE_SIZE) {
            throw new Error('This file exceeds the 5 MB limit.');
        }
        if (file.size === 0) throw new Error('This file is empty.');
        const input = readYaml(await file.text());
        const envelope = z
            .object({ contentType: z.string().optional() })
            .passthrough()
            .safeParse(input);
        if (!envelope.success) {
            throw new Error('Expected one YAML object per file.');
        }
        const value = envelope.data;
        let type = value.contentType;
        // Legacy chart/dashboard downloads can omit contentType.
        if (!type) {
            const chart = 'metricQuery' in value && 'chartConfig' in value;
            const dashboard = 'tiles' in value;
            if (chart !== dashboard) type = chart ? 'chart' : 'dashboard';
        }
        let document: ImportDocument;
        if (type === 'space') {
            const result = spaceSchema.safeParse(input);
            if (!result.success) {
                throw new Error(
                    result.error.issues
                        .map(
                            (issue) =>
                                `${issue.path.join('.')}: ${issue.message}`,
                        )
                        .join('\n'),
                );
            }
            document = { type, content: result.data };
        } else if (type === 'chart' || type === 'dashboard') {
            const validate =
                type === 'chart' ? validateChart : validateDashboard;
            if (!validate(input)) {
                throw new Error(
                    (validate.errors ?? [])
                        .slice(0, 4)
                        .map(
                            (error) =>
                                `${error.instancePath || 'File'} ${error.message}`,
                        )
                        .join('\n'),
                );
            }
            if (type === 'chart') {
                document = { type, content: input as ChartAsCode };
            } else {
                document = { type, content: input as DashboardAsCode };
            }
        } else {
            throw new Error(
                type
                    ? `“${type}” files are not supported yet. Add spaces, charts, or dashboards.`
                    : 'Could not detect a space, chart, or dashboard. Check the contentType field.',
            );
        }
        return { ...entry, document, status: 'ready' };
    } catch (error) {
        return {
            ...entry,
            message:
                error instanceof Error
                    ? error.message
                    : 'Could not read this file.',
        };
    }
};

export const getDuplicateImportIds = (entries: ImportEntry[]): Set<string> => {
    const identities = new Map<string, string[]>();
    entries.forEach(({ id, document }) => {
        if (!document) return;
        const identity = `${document.type}:${document.content.slug}`;
        identities.set(identity, [...(identities.get(identity) ?? []), id]);
    });
    return new Set(
        [...identities.values()].filter((ids) => ids.length > 1).flat(),
    );
};

export const sortImportEntries = (entries: ImportEntry[]): ImportEntry[] => {
    const order = { space: 0, chart: 1, dashboard: 2 };
    return [...entries].sort((a, b) => {
        if (!a.document || !b.document)
            return Number(!a.document) - Number(!b.document);
        const typeOrder = order[a.document.type] - order[b.document.type];
        if (typeOrder) return typeOrder;
        if (a.document.type === 'space' && b.document.type === 'space') {
            const depth =
                a.document.content.slug.split('/').length -
                b.document.content.slug.split('/').length;
            if (depth) return depth;
        }
        return a.document.content.slug.localeCompare(b.document.content.slug);
    });
};

export const runContentImport = async ({
    entries,
    upload,
    onUpdate,
    shouldStop,
}: {
    entries: ImportEntry[];
    upload: UploadContent;
    onUpdate: (entry: ImportEntry) => void;
    shouldStop: () => boolean;
}): Promise<void> => {
    const failedCharts = new Set<string>();
    const failedSpaces = new Set<string>();
    for (const entry of sortImportEntries(entries)) {
        if (shouldStop()) break;
        if (
            !entry.document ||
            entry.status === 'success' ||
            entry.status === 'invalid'
        )
            continue;
        const document = entry.document;
        const failedParent = [...failedSpaces].find((slug) =>
            document.content.slug.startsWith(`${slug}/`),
        );
        const failedChart =
            document.type === 'dashboard'
                ? document.content.tiles.find(
                      (tile) =>
                          (tile.type === 'saved_chart' ||
                              tile.type === 'sql_chart') &&
                          tile.properties.chartSlug &&
                          failedCharts.has(tile.properties.chartSlug),
                  )
                : null;
        const blocked =
            document.type === 'space'
                ? failedParent
                    ? `Parent space “${failedParent}” failed. Retry after it succeeds.`
                    : null
                : failedSpaces.size > 0
                  ? 'A space failed to upload. Retry after all spaces succeed.'
                  : failedChart
                    ? 'A chart used by this dashboard failed. Retry after the chart succeeds.'
                    : null;
        if (blocked) {
            onUpdate({ ...entry, status: 'blocked', message: blocked });
            continue;
        }
        onUpdate({ ...entry, status: 'uploading', message: null });
        try {
            const result = await upload(document);
            onUpdate({
                ...entry,
                status: 'success',
                message: result.message,
                warnings: result.warnings,
            });
        } catch (error) {
            if (document.type === 'space')
                failedSpaces.add(document.content.slug);
            if (document.type === 'chart')
                failedCharts.add(document.content.slug);
            onUpdate({
                ...entry,
                status: 'error',
                message:
                    error instanceof Error
                        ? error.message
                        : 'Upload failed. You can retry this file.',
            });
        }
    }
};
