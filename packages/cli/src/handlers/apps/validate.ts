import {
    buildDataAppExploreIndexFromExplores,
    buildDataAppExploreIndexFromModelFiles,
    checkDataAppDataReferences,
    computeCustomDependencies,
    dataAppVizSchema,
    extractDataAppDataReferences,
    getErrorMessage,
    isSummaryExploreError,
    isValidDataAppSlug,
    ParameterError,
    sanitizeAppPackageJsonScripts,
    validateDataAppDependencies,
    type ApiExploreResults,
    type ApiExploresResults,
    type DataAppCode,
    type DataAppDataReferences,
    type DataAppExploreIndex,
    type DataAppManifest,
    type DataAppSourceFile,
    type DataReferenceLocation,
} from '@lightdash/common';
import execa from 'execa';
import { promises as fs } from 'fs';
import * as os from 'os';
import pLimit from 'p-limit';
import * as path from 'path';
import { getConfig } from '../../config';
import { CLI_VERSION } from '../../env';
import GlobalState from '../../globalState';
import * as styles from '../../styles';
import { lightdashApi } from '../dbt/apiClient';
import {
    applySdkMirrorToTemplateDeps,
    readBundleFromDir,
    readDependenciesFromDir,
    writeFilesToDir,
} from './appCodeFiles';
import {
    loadTemplateDependencies,
    loadVendoredBuildScaffold,
} from './scaffolding';

export type AppsValidateFormat = 'human' | 'json';

export type AppsValidateOptions = {
    build: boolean;
    format: AppsValidateFormat;
    live: boolean;
    verbose: boolean;
};

export type AppsValidationIssueCode =
    | 'build'
    | 'bundle'
    | 'dependencies'
    | 'external_connection'
    | 'manifest'
    | 'semantic_layer'
    | 'semantic_reference'
    | 'source_parse';

export type AppsValidationIssue = {
    code: AppsValidationIssueCode;
    message: string;
    location: DataReferenceLocation | null;
};

export type AppsValidationCoverage = DataAppDataReferences['stats'] & {
    unanalyzed: number;
};

export type AppValidationResult = {
    path: string;
    name: string | null;
    projectUuid: string | null;
    valid: boolean;
    errors: AppsValidationIssue[];
    warnings: AppsValidationIssue[];
    coverage: AppsValidationCoverage;
};

export type AppsValidationReport = {
    build: boolean;
    valid: boolean;
    mode: 'live' | 'offline';
    summary: {
        apps: number;
        errors: number;
        warnings: number;
        callSites: number;
        unanalyzedCallSites: number;
    };
    apps: AppValidationResult[];
};

type ValidateAppOptions = {
    build?: boolean;
    live: boolean;
    liveProjectUuid?: string;
    loadLiveIndex: (projectUuid: string) => Promise<DataAppExploreIndex>;
    runBuild?: (args: {
        appDir: string;
        bundle: DataAppCode;
    }) => Promise<AppsValidationIssue[]>;
};

const emptyCoverage = (): AppsValidationCoverage => ({
    callSites: 0,
    fullyResolved: 0,
    partiallyResolved: 0,
    unresolved: 0,
    unanalyzed: 0,
});

const toCoverage = (
    stats: DataAppDataReferences['stats'],
): AppsValidationCoverage => ({
    ...stats,
    unanalyzed: stats.partiallyResolved + stats.unresolved,
});

const issue = (
    code: AppsValidationIssueCode,
    message: string,
    location: DataReferenceLocation | null = null,
): AppsValidationIssue => ({ code, message, location });

const readSemanticLayerFiles = async (
    appDir: string,
): Promise<DataAppSourceFile[]> => {
    const contextDir = path.join(appDir, '.lightdash', 'context');
    const candidates = [path.join(contextDir, 'semantic-layer.yml')];
    const modelsDir = path.join(contextDir, 'models');
    const modelEntries = await fs
        .readdir(modelsDir, { withFileTypes: true })
        .catch((error: NodeJS.ErrnoException) => {
            if (error.code === 'ENOENT') return [];
            throw error;
        });

    for (const entry of modelEntries) {
        if (entry.isFile()) candidates.push(path.join(modelsDir, entry.name));
    }

    const files = await Promise.all(
        candidates.map(async (filePath) => {
            try {
                const content = await fs.readFile(filePath, 'utf-8');
                return {
                    path: path
                        .relative(appDir, filePath)
                        .split(path.sep)
                        .join('/'),
                    content,
                };
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                    return null;
                }
                throw error;
            }
        }),
    );
    return files.filter((file): file is DataAppSourceFile => file !== null);
};

const validateManifest = (
    manifest: DataAppManifest,
): { errors: AppsValidationIssue[]; aliases: Set<string> } => {
    const errors: AppsValidationIssue[] = [];
    if (manifest.slug !== undefined && !isValidDataAppSlug(manifest.slug)) {
        errors.push(
            issue(
                'manifest',
                `Invalid slug "${manifest.slug}" in lightdash-app.yml. Slugs must start with a lowercase letter or digit and contain only lowercase letters, digits, and hyphens, up to 255 characters.`,
            ),
        );
    }

    if (manifest.vizSchema !== undefined) {
        const parsed = dataAppVizSchema.safeParse(manifest.vizSchema);
        if (!parsed.success) {
            const details = parsed.error.issues
                .map((entry) => `${entry.path.join('.')}: ${entry.message}`)
                .join('; ');
            errors.push(
                issue(
                    'manifest',
                    `Invalid vizSchema in lightdash-app.yml (${details}).`,
                ),
            );
        }
    }

    const aliases = new Set<string>();
    const links = manifest.externalConnections;
    if (links === undefined) return { errors, aliases };
    if (!Array.isArray(links)) {
        errors.push(
            issue(
                'manifest',
                'Invalid externalConnections in lightdash-app.yml: expected a list.',
            ),
        );
        return { errors, aliases };
    }

    for (const link of links) {
        if (
            !link ||
            typeof link !== 'object' ||
            typeof link.alias !== 'string' ||
            typeof link.connectionSlug !== 'string'
        ) {
            errors.push(
                issue(
                    'manifest',
                    'Invalid externalConnections entry in lightdash-app.yml: expected alias and connectionSlug strings.',
                ),
            );
        } else {
            const duplicate = aliases.has(link.alias);
            aliases.add(link.alias);
            if (!/^[a-z0-9_-]+$/i.test(link.alias) || link.alias.length > 64) {
                errors.push(
                    issue(
                        'manifest',
                        `Invalid external connection alias "${link.alias}" in lightdash-app.yml: aliases must contain only letters, numbers, hyphens, and underscores (max 64 characters).`,
                    ),
                );
            } else if (duplicate) {
                errors.push(
                    issue(
                        'manifest',
                        `Duplicate external connection alias "${link.alias}" in lightdash-app.yml.`,
                    ),
                );
            }
        }
    }
    return { errors, aliases };
};

const validateDependencies = async (
    appDir: string,
): Promise<AppsValidationIssue[]> => {
    try {
        const deps = await readDependenciesFromDir(appDir);
        if (deps === null) return [];
        const templateDependencies = applySdkMirrorToTemplateDeps(
            loadTemplateDependencies(CLI_VERSION),
            deps.packageJson,
        );

        if (deps.lockfile === null) {
            const customDeps = computeCustomDependencies(
                deps.packageJson,
                templateDependencies,
            );
            if (Object.keys(customDeps).length > 0) {
                const hint = deps.hasNpmLockfile
                    ? 'package-lock.json is not used by the server; run `pnpm install` to generate pnpm-lock.yaml.'
                    : 'Run `pnpm install` to generate pnpm-lock.yaml.';
                return [
                    issue(
                        'dependencies',
                        `Custom dependencies require pnpm-lock.yaml. ${hint}`,
                    ),
                ];
            }
            return [];
        }

        validateDataAppDependencies(
            { packageJson: deps.packageJson, lockfile: deps.lockfile },
            { templateDependencies },
        );
        return [];
    } catch (error) {
        return [issue('dependencies', getErrorMessage(error))];
    }
};

type DataAppBuildCommand = {
    command: string;
    args: string[];
    cwd: string;
    env?: NodeJS.ProcessEnv;
    preferLocal?: boolean;
    timeoutMs: number;
};

export type RunDataAppBuildCommand = (
    command: DataAppBuildCommand,
) => Promise<void>;

const runDataAppBuildCommand: RunDataAppBuildCommand = async (command) => {
    await execa(command.command, command.args, {
        cwd: command.cwd,
        env: command.env,
        localDir: command.preferLocal ? command.cwd : undefined,
        preferLocal: command.preferLocal,
        timeout: command.timeoutMs,
    });
};

const commandFailureOutput = (error: unknown): string => {
    const commandError =
        typeof error === 'object' && error !== null
            ? (error as {
                  stderr?: unknown;
                  stdout?: unknown;
              })
            : {};
    const output = [commandError.stderr, commandError.stdout]
        .filter(
            (value): value is string | Buffer =>
                typeof value === 'string' || Buffer.isBuffer(value),
        )
        .map(String)
        .filter(Boolean)
        .join('\n')
        .trim();
    return (output || getErrorMessage(error)).slice(-2000);
};

const hasNodeModules = async (appDir: string): Promise<boolean> =>
    fs
        .stat(path.join(appDir, 'node_modules'))
        .then((entry) => entry.isDirectory())
        .catch(() => false);

const buildPackageJsonForCustomDependencies = (
    scaffold: DataAppCode['files'],
    packageJson: string,
): string => {
    const packageFile = scaffold.find((file) => file.path === 'package.json');
    if (packageFile === undefined) {
        throw new Error('Vendored data app template is missing package.json.');
    }
    const templatePackage = JSON.parse(
        Buffer.from(packageFile.contentBase64, 'base64').toString('utf-8'),
    ) as {
        scripts?: Record<string, string>;
        devDependencies?: Record<string, string>;
    };
    if (
        templatePackage.scripts === undefined ||
        templatePackage.devDependencies === undefined
    ) {
        throw new Error(
            'Vendored data app template package.json is missing scripts or devDependencies.',
        );
    }
    return sanitizeAppPackageJsonScripts(
        packageJson,
        templatePackage.scripts,
        templatePackage.devDependencies,
    );
};

export const validateDataAppBuild = async (args: {
    appDir: string;
    bundle: DataAppCode;
    runCommand?: RunDataAppBuildCommand;
}): Promise<AppsValidationIssue[]> => {
    const runCommand = args.runCommand ?? runDataAppBuildCommand;
    let dependencies: Awaited<ReturnType<typeof readDependenciesFromDir>>;
    let hasCustomDependencies: boolean;
    try {
        dependencies = await readDependenciesFromDir(args.appDir);
        const templateDependencies =
            dependencies === null
                ? loadTemplateDependencies(CLI_VERSION)
                : applySdkMirrorToTemplateDeps(
                      loadTemplateDependencies(CLI_VERSION),
                      dependencies.packageJson,
                  );
        const customDependencies =
            dependencies === null
                ? {}
                : computeCustomDependencies(
                      dependencies.packageJson,
                      templateDependencies,
                  );
        hasCustomDependencies = Object.keys(customDependencies).length > 0;
    } catch (error) {
        return [issue('dependencies', getErrorMessage(error))];
    }

    if (!hasCustomDependencies && !(await hasNodeModules(args.appDir))) {
        return [
            issue(
                'dependencies',
                `Dependencies are not installed. Run 'npm install' in ${args.appDir} before using lightdash apps validate --build.`,
            ),
        ];
    }
    if (
        hasCustomDependencies &&
        dependencies !== null &&
        dependencies.lockfile === null
    ) {
        return [
            issue(
                'dependencies',
                'Custom dependencies require pnpm-lock.yaml before the Cloud-parity build can run.',
            ),
        ];
    }

    let buildDir: string | undefined;
    try {
        buildDir = await fs.mkdtemp(
            path.join(os.tmpdir(), 'lightdash-app-build-'),
        );
        const scaffold = loadVendoredBuildScaffold(CLI_VERSION);
        await writeFilesToDir(buildDir, [...scaffold, ...args.bundle.files]);

        if (
            hasCustomDependencies &&
            dependencies !== null &&
            dependencies.lockfile !== null
        ) {
            await Promise.all([
                fs.writeFile(
                    path.join(buildDir, 'package.json'),
                    buildPackageJsonForCustomDependencies(
                        scaffold,
                        dependencies.packageJson,
                    ),
                ),
                fs.writeFile(
                    path.join(buildDir, 'pnpm-lock.yaml'),
                    dependencies.lockfile,
                ),
            ]);
            try {
                await runCommand({
                    command: 'pnpm',
                    args: ['install', '--frozen-lockfile', '--ignore-scripts'],
                    cwd: buildDir,
                    env: { CI: 'true' },
                    timeoutMs: 120_000,
                });
            } catch (error) {
                return [
                    issue(
                        'dependencies',
                        `Dependency install failed: ${commandFailureOutput(error)}`,
                    ),
                ];
            }
        } else {
            await fs.symlink(
                path.resolve(args.appDir, 'node_modules'),
                path.join(buildDir, 'node_modules'),
                process.platform === 'win32' ? 'junction' : 'dir',
            );
        }

        try {
            await runCommand({
                command: 'vite',
                args: ['build'],
                cwd: buildDir,
                preferLocal: true,
                timeoutMs: 60_000,
            });
        } catch (error) {
            return [
                issue(
                    'build',
                    `Vite build failed:\n${commandFailureOutput(error)}`,
                ),
            ];
        }
        return [];
    } catch (error) {
        return [
            issue(
                'build',
                `Could not prepare the Vite build: ${getErrorMessage(error)}`,
            ),
        ];
    } finally {
        if (buildDir !== undefined) {
            await fs
                .rm(buildDir, { recursive: true, force: true })
                .catch(() => undefined);
        }
    }
};

const sourceFilesFromBundle = (
    files: { path: string; contentBase64: string }[],
): DataAppSourceFile[] =>
    files.map((file) => ({
        path: file.path,
        content: Buffer.from(file.contentBase64, 'base64').toString('utf-8'),
    }));

export const fetchLiveDataAppExploreIndex = async (
    projectUuid: string,
): Promise<DataAppExploreIndex> => {
    const summaries = await lightdashApi<ApiExploresResults>({
        method: 'GET',
        url: `/api/v1/projects/${projectUuid}/explores`,
        body: undefined,
    });
    const limit = pLimit(8);
    const explores = await Promise.all(
        summaries
            .filter((summary) => !isSummaryExploreError(summary))
            .map((summary) =>
                limit(() =>
                    lightdashApi<ApiExploreResults>({
                        method: 'GET',
                        url: `/api/v1/projects/${projectUuid}/explores/${encodeURIComponent(summary.name)}`,
                        body: undefined,
                    }),
                ),
            ),
    );
    return buildDataAppExploreIndexFromExplores(explores);
};

export const validateLocalDataApp = async (
    appPath: string,
    options: ValidateAppOptions,
): Promise<AppValidationResult> => {
    const appDir = path.resolve(appPath);
    const errors: AppsValidationIssue[] = [];
    const warnings: AppsValidationIssue[] = [];
    let bundle: Awaited<ReturnType<typeof readBundleFromDir>>;

    try {
        bundle = await readBundleFromDir(appDir);
    } catch (error) {
        return {
            path: appDir,
            name: null,
            projectUuid: null,
            valid: false,
            errors: [issue('bundle', getErrorMessage(error))],
            warnings,
            coverage: emptyCoverage(),
        };
    }

    const { manifest } = bundle;
    const manifestResult = validateManifest(manifest);
    errors.push(...manifestResult.errors);
    const dependencyErrors = await validateDependencies(appDir);
    errors.push(...dependencyErrors);

    const sourceFiles = sourceFilesFromBundle(bundle.files);
    if (sourceFiles.length === 0) {
        errors.push(
            issue('bundle', 'App bundle has no files under src/ to validate.'),
        );
    }

    const extracted = extractDataAppDataReferences(sourceFiles);
    const coverage = toCoverage(extracted.stats);
    warnings.push(
        ...extracted.parseErrors.map((parseError) =>
            issue(
                'source_parse',
                `Could not statically analyze ${parseError.path}: ${parseError.message}`,
            ),
        ),
    );

    for (const ref of extracted.references) {
        if (
            ref.kind === 'externalFetch' &&
            ref.alias !== null &&
            !manifestResult.aliases.has(ref.alias)
        ) {
            errors.push(
                issue(
                    'external_connection',
                    `externalFetch alias "${ref.alias}" is not declared in lightdash-app.yml externalConnections.`,
                    ref.location,
                ),
            );
        }
    }

    const hasSemanticReferences = extracted.references.some(
        (ref) => ref.kind !== 'externalFetch',
    );
    if (hasSemanticReferences) {
        try {
            let exploreIndex: DataAppExploreIndex;
            if (options.live) {
                if (!options.liveProjectUuid) {
                    throw new Error(
                        "No project selected. Run 'lightdash config set-project' before using --live validation.",
                    );
                }
                exploreIndex = await options.loadLiveIndex(
                    options.liveProjectUuid,
                );
            } else {
                const semanticFiles = await readSemanticLayerFiles(appDir);
                if (semanticFiles.length === 0) {
                    throw new Error('No local semantic layer snapshot found.');
                }
                exploreIndex =
                    buildDataAppExploreIndexFromModelFiles(semanticFiles);
            }
            errors.push(
                ...checkDataAppDataReferences(
                    extracted.references,
                    exploreIndex,
                ).map((referenceError) =>
                    issue(
                        'semantic_reference',
                        referenceError.error,
                        referenceError.location,
                    ),
                ),
            );
        } catch (error) {
            const message = getErrorMessage(error);
            let semanticLayerMessage: string;
            if (options.live) {
                semanticLayerMessage = `Could not load live semantic layer: ${message}`;
            } else if (message.toLowerCase().includes('re-download')) {
                semanticLayerMessage = message;
            } else {
                semanticLayerMessage = `${message} Re-download the app to refresh its local semantic layer snapshot.`;
            }
            errors.push(issue('semantic_layer', semanticLayerMessage));
        }
    }

    let projectUuid: string | null = null;
    if (options.live) {
        projectUuid = options.liveProjectUuid ?? null;
    } else if (typeof manifest.projectUuid === 'string') {
        projectUuid = manifest.projectUuid;
    }

    if (options.build && dependencyErrors.length === 0) {
        errors.push(
            ...(await (options.runBuild ?? validateDataAppBuild)({
                appDir,
                bundle,
            })),
        );
    }

    return {
        path: appDir,
        name: typeof manifest.name === 'string' ? manifest.name : null,
        projectUuid,
        valid: errors.length === 0,
        errors,
        warnings,
        coverage,
    };
};

export const buildAppsValidationReport = (
    apps: AppValidationResult[],
    live: boolean,
    build = false,
): AppsValidationReport => {
    const errors = apps.reduce((count, app) => count + app.errors.length, 0);
    const warnings = apps.reduce(
        (count, app) => count + app.warnings.length,
        0,
    );
    return {
        build,
        valid: errors === 0,
        mode: live ? 'live' : 'offline',
        summary: {
            apps: apps.length,
            errors,
            warnings,
            callSites: apps.reduce(
                (count, app) => count + app.coverage.callSites,
                0,
            ),
            unanalyzedCallSites: apps.reduce(
                (count, app) => count + app.coverage.unanalyzed,
                0,
            ),
        },
        apps,
    };
};

const formatCoverage = (coverage: AppsValidationCoverage): string => {
    if (coverage.callSites === 0) {
        return 'Coverage: no data-reference call sites found.';
    }
    if (coverage.unanalyzed === 0) {
        return `Coverage: all ${coverage.callSites} data-reference call site(s) were statically analyzed.`;
    }
    return `Coverage: ${coverage.unanalyzed} of ${coverage.callSites} data-reference call site(s) couldn't be fully analyzed; unresolved values were skipped and are not errors.`;
};

const formatIssue = (entry: AppsValidationIssue): string => {
    const prefix = entry.location
        ? `${entry.location.path}:${entry.location.line}:${entry.location.column} — `
        : '';
    return `${prefix}${entry.message}`;
};

export const renderAppsValidationHuman = (
    report: AppsValidationReport,
): string => {
    const lines = [
        `Validating ${report.summary.apps} data app(s) using ${
            report.mode === 'live'
                ? 'the live project semantic layer'
                : 'local semantic layer snapshots'
        }${report.build ? ' and running Vite production builds' : ''}.`,
    ];
    if (report.mode === 'offline') {
        lines.push(
            styles.secondary(
                'Offline snapshots may be stale. Use --live for upload-time semantic validation parity.',
            ),
        );
    }

    for (const app of report.apps) {
        lines.push('');
        const label = app.name ? `${app.name} (${app.path})` : app.path;
        lines.push(
            `${app.valid ? styles.success('✓') : styles.error('✗')} ${label}`,
        );
        lines.push(`  ${formatCoverage(app.coverage)}`);
        for (const warning of app.warnings) {
            lines.push(
                `  ${styles.warning('warning')} ${formatIssue(warning)}`,
            );
        }
        for (const error of app.errors) {
            lines.push(`  ${styles.error('error')} ${formatIssue(error)}`);
        }
    }

    lines.push('');
    lines.push(
        report.valid
            ? styles.success(
                  `Validation passed for ${report.summary.apps} data app(s) with ${report.summary.warnings} warning(s).`,
              )
            : styles.error(
                  `Validation failed with ${report.summary.errors} error(s) across ${report.summary.apps} data app(s).`,
              ),
    );
    return `${lines.join('\n')}\n`;
};

export const appsValidateHandler = async (
    pathArgs: string[] | undefined,
    options: AppsValidateOptions,
): Promise<void> => {
    GlobalState.setVerbose(options.verbose);
    const paths = pathArgs && pathArgs.length > 0 ? pathArgs : ['.'];
    const resolvedPaths = [
        ...new Set(
            paths.map((appPath) => path.resolve(process.cwd(), appPath)),
        ),
    ];
    const liveProjectUuid = options.live
        ? (await getConfig()).context?.project
        : undefined;
    const liveIndexes = new Map<string, Promise<DataAppExploreIndex>>();
    const loadLiveIndex = (
        projectUuid: string,
    ): Promise<DataAppExploreIndex> => {
        const cached = liveIndexes.get(projectUuid);
        if (cached) return cached;
        const pending = fetchLiveDataAppExploreIndex(projectUuid);
        liveIndexes.set(projectUuid, pending);
        return pending;
    };

    const apps = await Promise.all(
        resolvedPaths.map((appPath) =>
            validateLocalDataApp(appPath, {
                live: options.live,
                liveProjectUuid,
                loadLiveIndex,
                build: options.build,
            }),
        ),
    );
    const report = buildAppsValidationReport(apps, options.live, options.build);
    process.stdout.write(
        options.format === 'json'
            ? `${JSON.stringify(report, null, 2)}\n`
            : renderAppsValidationHuman(report),
    );

    if (!report.valid) {
        throw new ParameterError(
            `Data app validation failed with ${report.summary.errors} error(s).`,
        );
    }
};
