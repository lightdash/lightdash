import {
    DuckdbConnectionType,
    isExploreError,
    WarehouseTypes,
    type Explore,
    type ExploreError,
} from '@lightdash/common';
import {
    DuckdbWarehouseClient,
    EMBEDDED_BUNDLE_EXPLORES_FILE,
    getEmbeddedDatabaseFileName,
    readEmbeddedBundle,
    readEmbeddedBundles,
    verifyEmbeddedBundleFile,
} from '@lightdash/warehouses';
import * as Sentry from '@sentry/node';
import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';
import { loadPlaygroundContent } from '../../ee/services/ProjectService/loadPlaygroundContent';
import { type PlaygroundContent } from '../../ee/services/ProjectService/playgroundContentTypes';
import Logger from '../../logging/logger';
import { type ProjectModel } from '../../models/ProjectModel/ProjectModel';

export const PLAYGROUND_DATASET = 'jaffle_shop';
const PLAYGROUND_CONTENT_FILE = 'content.json';

export type PlaygroundBundle = {
    version: string;
    explores: (Explore | ExploreError)[];
    content: PlaygroundContent;
};

export type PlaygroundDatabaseCheck = {
    bundleVersion: string;
    expectedTables: string[];
};

const fieldSchema = z.looseObject({
    name: z.string(),
    table: z.string(),
    fieldType: z.string(),
});

const exploreTableSchema = z.looseObject({
    name: z.string(),
    database: z.string(),
    schema: z.string(),
    sqlTable: z.string(),
    dimensions: z.record(z.string(), fieldSchema),
    metrics: z.record(z.string(), fieldSchema),
});

const exploreSchema = z
    .looseObject({
        name: z.string().min(1),
        label: z.string(),
        baseTable: z.string(),
        joinedTables: z.array(z.unknown()),
        tables: z.record(z.string(), exploreTableSchema),
    })
    .refine(({ baseTable, tables }) => baseTable in tables, {
        message: 'baseTable must be one of the explore tables',
    });

const exploreErrorSchema = z.looseObject({
    name: z.string().min(1),
    errors: z.array(z.looseObject({ type: z.string(), message: z.string() })),
});

const bundleExploresSchema = z
    .array(z.union([exploreErrorSchema, exploreSchema]))
    .min(1);

const parseBundleExplores = (json: string): (Explore | ExploreError)[] => {
    let value: unknown;
    try {
        value = JSON.parse(json);
    } catch (error) {
        throw new Error('Playground bundle contains invalid JSON', {
            cause: error,
        });
    }
    const result = bundleExploresSchema.safeParse(value);
    if (!result.success) {
        throw new Error(
            `Playground explores bundle is invalid: ${z.prettifyError(result.error)}`,
        );
    }
    // The schema checks the fields provisioning and queries rely on; the
    // build compiled the rest with the same compiler as the backend.
    return value as (Explore | ExploreError)[];
};

const SQL_TABLE = /^"([^"]+)"\."([^"]+)"\."([^"]+)"$/;

const getExpectedTables = (explores: (Explore | ExploreError)[]): string[] =>
    [
        ...new Set(
            explores.flatMap((explore) =>
                isExploreError(explore)
                    ? []
                    : Object.values(explore.tables).flatMap(({ sqlTable }) =>
                          SQL_TABLE.test(sqlTable) ? [sqlTable] : [],
                      ),
            ),
        ),
    ].sort();

export const validatePlaygroundDatabaseBundle = async ({
    bundleVersion,
    expectedTables,
}: PlaygroundDatabaseCheck): Promise<void> => {
    const client = new DuckdbWarehouseClient({
        type: WarehouseTypes.DUCKDB,
        connectionType: DuckdbConnectionType.EMBEDDED,
        dataset: PLAYGROUND_DATASET,
        bundleVersion,
    });
    const { rows } = await client.runQuery(
        'SELECT table_catalog, table_schema, table_name FROM information_schema.tables',
    );
    const actual = new Set(
        rows.map(
            (row) =>
                `"${row.table_catalog}"."${row.table_schema}"."${row.table_name}"`,
        ),
    );
    if (actual.size === 0) {
        throw new Error('Playground database has no tables');
    }
    const missing = expectedTables.filter((table) => !actual.has(table));
    if (missing.length > 0) {
        throw new Error(
            `Playground database is missing tables the explores use: ${missing.join(', ')}`,
        );
    }
};

/**
 * Reads the current bundle and refuses it unless every payload matches
 * SHA256SUMS, the explores match the expected shape, and the database has
 * every table the explores query.
 */
export const loadPlaygroundBundle = async (
    dataDirectory: string,
    validatePlaygroundDatabase: (
        check: PlaygroundDatabaseCheck,
    ) => Promise<void>,
): Promise<PlaygroundBundle> => {
    const bundle = readEmbeddedBundle(dataDirectory, PLAYGROUND_DATASET);
    if (!bundle) {
        throw new Error(`No playground bundle found in ${dataDirectory}`);
    }
    const exploresPath = verifyEmbeddedBundleFile(
        bundle,
        EMBEDDED_BUNDLE_EXPLORES_FILE,
    );
    verifyEmbeddedBundleFile(bundle, PLAYGROUND_CONTENT_FILE);
    verifyEmbeddedBundleFile(
        bundle,
        getEmbeddedDatabaseFileName(PLAYGROUND_DATASET),
    );

    const [explores, content] = await Promise.all([
        fs.readFile(exploresPath, 'utf8').then(parseBundleExplores),
        loadPlaygroundContent(dataDirectory),
    ]);
    const expectedTables = getExpectedTables(explores);
    if (expectedTables.length === 0) {
        throw new Error('Playground explores do not reference any table');
    }
    await validatePlaygroundDatabase({
        bundleVersion: bundle.version,
        expectedTables,
    });
    return { version: bundle.version, explores, content };
};

/** Longer than a rolling deploy takes, so no server from the previous release is left when projects move. */
export const PLAYGROUND_BUNDLE_ADOPTION_DELAY_MS = 30 * 60 * 1000;

export const getPlaygroundDataDirectory = (): string =>
    path.resolve(
        process.env.PLAYGROUND_DATA_DIR ??
            path.join(__dirname, '../../../assets/playground'),
    );

export const getCurrentPlaygroundBundleVersion = (
    dataDirectory: string,
): string => {
    const bundle = readEmbeddedBundle(dataDirectory, PLAYGROUND_DATASET);
    if (!bundle) {
        throw new Error(`No playground bundle found in ${dataDirectory}`);
    }
    return bundle.version;
};

export const getServablePlaygroundBundleVersions = (
    dataDirectory: string,
): string[] => {
    const { current, previous } = readEmbeddedBundles(
        dataDirectory,
        PLAYGROUND_DATASET,
    );
    return [current, previous].flatMap((bundle) =>
        bundle ? [bundle.version] : [],
    );
};

/**
 * A project moves to this server's bundle once every server can serve it,
 * which is after the version has been live for the adoption delay. It moves
 * at once when this server cannot serve the project's version at all.
 * Projects without a version predate versioning and use the current file.
 */
export const shouldAdoptPlaygroundBundle = ({
    projectVersion,
    currentVersion,
    servableVersions,
    currentFirstSeenAt,
    now,
}: {
    projectVersion: string | null;
    currentVersion: string;
    servableVersions: string[];
    currentFirstSeenAt: Date;
    now: Date;
}): boolean => {
    if (projectVersion === currentVersion) return false;
    if (projectVersion !== null && !servableVersions.includes(projectVersion)) {
        return true;
    }
    return (
        now.getTime() - currentFirstSeenAt.getTime() >=
        PLAYGROUND_BUNDLE_ADOPTION_DELAY_MS
    );
};

export type ReconcilePlaygroundBundlesResult = {
    version: string;
    adopted: number;
    waiting: number;
    failed: number;
};

/** Moves playground and training projects to this server's bundle when the adoption rule allows it. */
export const reconcilePlaygroundBundles = async ({
    projectModel,
    dataDirectory = getPlaygroundDataDirectory(),
    validatePlaygroundDatabase = validatePlaygroundDatabaseBundle,
    now = new Date(),
}: {
    projectModel: Pick<
        ProjectModel,
        | 'recordPlaygroundBundleVersionSeen'
        | 'getPlaygroundBundleProjectsNotOnVersion'
        | 'saveExploresToCache'
    >;
    dataDirectory?: string;
    validatePlaygroundDatabase?: (
        check: PlaygroundDatabaseCheck,
    ) => Promise<void>;
    now?: Date;
}): Promise<ReconcilePlaygroundBundlesResult> => {
    const servableVersions = getServablePlaygroundBundleVersions(dataDirectory);
    const [currentVersion] = servableVersions;
    if (currentVersion === undefined) {
        throw new Error(`No playground bundle found in ${dataDirectory}`);
    }
    const currentFirstSeenAt =
        await projectModel.recordPlaygroundBundleVersionSeen(currentVersion);
    const projects =
        await projectModel.getPlaygroundBundleProjectsNotOnVersion(
            currentVersion,
        );
    const toAdopt = projects.filter(({ playgroundBundleVersion }) =>
        shouldAdoptPlaygroundBundle({
            projectVersion: playgroundBundleVersion,
            currentVersion,
            servableVersions,
            currentFirstSeenAt,
            now,
        }),
    );
    const result: ReconcilePlaygroundBundlesResult = {
        version: currentVersion,
        adopted: 0,
        waiting: projects.length - toAdopt.length,
        failed: 0,
    };
    if (toAdopt.length === 0) return result;

    const bundle = await loadPlaygroundBundle(
        dataDirectory,
        validatePlaygroundDatabase,
    );
    // One project at a time: each save replaces a project's whole explore cache.
    await toAdopt.reduce(async (previous, { projectUuid }) => {
        await previous;
        try {
            await projectModel.saveExploresToCache(
                projectUuid,
                bundle.explores,
                true,
                undefined,
                bundle.version,
            );
            result.adopted += 1;
        } catch (error) {
            result.failed += 1;
            Sentry.captureException(error);
            Logger.error(
                `Failed to move project ${projectUuid} to playground bundle ${bundle.version}: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
        }
    }, Promise.resolve());
    return result;
};
