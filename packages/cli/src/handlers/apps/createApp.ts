import {
    AuthorizationError,
    DATA_APP_VIZ_TEMPLATE,
    generateSlug,
    isValidDataAppSlug,
    LightdashError,
    ParameterError,
    type DataAppContext,
    type DataAppManifest,
    type DataAppVizSchema,
} from '@lightdash/common';
import execa from 'execa';
import { promises as fs } from 'fs';
import inquirer from 'inquirer';
import * as path from 'path';
import { LightdashAnalytics } from '../../analytics/analytics';
import { getConfig } from '../../config';
import { CLI_VERSION } from '../../env';
import GlobalState from '../../globalState';
import * as styles from '../../styles';
import { getDownloadFolder } from '../contentAsCodePaths';
import { checkLightdashVersion, lightdashApi } from '../dbt/apiClient';
import { logSelectedProject, selectProject } from '../selectProject';
import {
    writeBundleToDir,
    writeContextToDir,
    writeFilesToDir,
} from './appCodeFiles';
import {
    buildStaticAuthoringFiles,
    loadChartTypeStarterApp,
    loadVendoredStarterSource,
} from './scaffolding';

export type CreateAppHandlerOptions = {
    assumeYes?: boolean;
    chartType?: boolean;
    description?: string;
    path?: string;
    project?: string;
    slug?: string;
    verbose: boolean;
};

// Declaration matching the starter component in authoring/chart-type/App.jsx —
// the two must stay in lockstep (every key the component reads from
// fieldMapping/options is declared here, and everything declared is read).
export const CHART_TYPE_STARTER_VIZ_SCHEMA: DataAppVizSchema = {
    fields: [
        {
            name: 'category',
            label: 'Category',
            type: 'dimension',
            required: true,
        },
        { name: 'value', label: 'Value', type: 'metric', required: true },
    ],
    configOptions: [
        {
            type: 'boolean',
            name: 'showLabels',
            label: 'Show value labels',
            group: 'Labels',
            default: true,
        },
        {
            type: 'number',
            name: 'maxBars',
            label: 'Max bars',
            default: 10,
            min: 1,
            max: 50,
        },
    ],
    colorPalette: {},
};

export const SHADCN_VERSION = '2.3.0';

export const SHADCN_COMPONENTS = [
    'button',
    'badge',
    'card',
    'table',
    'dialog',
    'tabs',
    'select',
    'input',
    'label',
    'popover',
    'tooltip',
    'separator',
    'skeleton',
    'dropdown-menu',
    'sheet',
    'scroll-area',
    'switch',
    'checkbox',
    'avatar',
    'alert',
    'progress',
    'resizable',
] as const;

export const resolveLocalAppSlug = (
    name: string,
    explicitSlug?: string,
): string => {
    if (name.trim().length === 0) {
        throw new ParameterError('Data app name cannot be empty.');
    }
    const slug = explicitSlug ?? generateSlug(name);
    if (!isValidDataAppSlug(slug)) {
        throw new ParameterError(
            `Invalid data app slug "${slug}". Slugs must start with a lowercase letter or digit and contain only lowercase letters, digits, and hyphens, up to 255 characters.`,
        );
    }
    return slug;
};

export const buildLocalAppManifest = (args: {
    name: string;
    description: string;
    projectUuid: string;
    slug: string;
    now: Date;
    chartType?: boolean;
}): DataAppManifest => ({
    codeVersion: 1,
    projectUuid: args.projectUuid,
    slug: args.slug,
    version: 1,
    name: args.name,
    description: args.description,
    template: args.chartType ? DATA_APP_VIZ_TEMPLATE : null,
    // vizSchema round-trips through upload — without it the uploaded chart
    // type never appears in the explorer's chart type picker.
    ...(args.chartType ? { vizSchema: CHART_TYPE_STARTER_VIZ_SCHEMA } : {}),
    downloadedAt: args.now.toISOString(),
    scaffoldingVersion: CLI_VERSION,
});

const assertAppDirectoryAvailable = async (appDir: string): Promise<void> => {
    try {
        await fs.access(appDir);
        throw new ParameterError(
            `Cannot create data app: ${appDir} already exists. Choose another slug or download the existing app.`,
        );
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return;
        }
        throw error;
    }
};

const parseDirectPackages = (
    staticFiles: ReturnType<typeof buildStaticAuthoringFiles>,
): string[] => {
    const packageJson = staticFiles.find(
        (file) => file.path === 'package.json',
    );
    if (!packageJson) {
        throw new Error('Data app template is missing package.json.');
    }
    const parsed = JSON.parse(
        Buffer.from(packageJson.contentBase64, 'base64').toString('utf8'),
    ) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
    };
    return Object.entries({
        ...parsed.dependencies,
        ...parsed.devDependencies,
    })
        .map(([packageName, version]) => `${packageName}@${version}`)
        .sort();
};

const assertNpmAvailable = async (): Promise<void> => {
    try {
        await execa('npm', ['--version']);
    } catch {
        throw new ParameterError(
            'npm is required to create a data app because Lightdash generates its shadcn UI locally. Install Node.js (which includes npm), then run this command again.',
        );
    }
};

const confirmLocalPackageTooling = async (
    assumeYes: boolean,
    entityLabel: string,
    withShadcn: boolean,
): Promise<void> => {
    GlobalState.log(
        styles.warning(
            [
                '⚠ Local package installation',
                `Creating a ${entityLabel} downloads third-party packages through npm into the new folder${
                    withShadcn
                        ? ` and runs shadcn@${SHADCN_VERSION} to generate UI files`
                        : ''
                }.`,
                `Dependency lifecycle scripts are disabled, but ${
                    withShadcn ? 'npm and shadcn' : 'npm'
                } will access the network and write files on this machine.`,
                'Only continue if you trust these package sources and are comfortable running this tooling locally.',
            ].join('\n'),
        ),
    );

    if (assumeYes) return;
    if (GlobalState.isNonInteractive()) {
        throw new ParameterError(
            `Creating a ${entityLabel} requires approval to download and install npm packages. Rerun with --assume-yes to approve in non-interactive mode.`,
        );
    }

    const { confirmed } = await inquirer.prompt<{ confirmed: boolean }>([
        {
            type: 'confirm',
            name: 'confirmed',
            message: 'Continue and review the packages to be installed?',
            default: false,
        },
    ]);
    if (!confirmed) {
        throw new ParameterError('Data app creation cancelled.');
    }
};

const confirmDependencyInstall = async (
    directPackages: string[],
    assumeYes: boolean,
    entityLabel: string,
    withShadcn: boolean,
): Promise<void> => {
    GlobalState.log(
        [
            `Creating this ${entityLabel} will install these direct npm packages:`,
            ...directPackages.map((packageSpec) => `  - ${packageSpec}`),
            ...(withShadcn
                ? [
                      `\nIt will also run shadcn@${SHADCN_VERSION} to generate:`,
                      `  ${SHADCN_COMPONENTS.join(', ')}`,
                  ]
                : []),
            "\nDependency lifecycle scripts will be disabled. React 19 peer dependencies will use npm's legacy-peer-deps mode.",
        ].join('\n'),
    );

    if (assumeYes) return;
    if (GlobalState.isNonInteractive()) {
        throw new ParameterError(
            `Creating a ${entityLabel} requires approval to install npm packages. Rerun with --assume-yes to approve in non-interactive mode.`,
        );
    }

    const { confirmed } = await inquirer.prompt<{ confirmed: boolean }>([
        {
            type: 'confirm',
            name: 'confirmed',
            message: `Install these packages and create the ${entityLabel}?`,
            default: false,
        },
    ]);
    if (!confirmed) {
        throw new ParameterError('Data app creation cancelled.');
    }
};

const installDependenciesAndShadcn = async (
    appDir: string,
    withShadcn: boolean,
): Promise<void> => {
    const npmEnv = {
        ...process.env,
        npm_config_ignore_scripts: 'true',
        npm_config_package_lock: 'false',
    };
    const subprocessOptions = {
        cwd: appDir,
        env: npmEnv,
        stdio: 'inherit' as const,
    };
    const shadcnOptions = {
        cwd: appDir,
        env: npmEnv,
        input: '\u001B[B\n',
        stdin: 'pipe' as const,
        stdout: 'inherit' as const,
        stderr: 'inherit' as const,
    };

    await execa(
        'npm',
        ['install', '--include=dev', '--ignore-scripts', '--no-package-lock'],
        subprocessOptions,
    );
    // Chart types are single chart components (recharts/d3/SVG) — the shadcn
    // UI kit would only be dead weight shipped in their published source.
    if (!withShadcn) return;
    await execa(
        'npx',
        ['--yes', `shadcn@${SHADCN_VERSION}`, 'init', '--defaults', '--force'],
        shadcnOptions,
    );
    await execa(
        'npx',
        [
            '--yes',
            `shadcn@${SHADCN_VERSION}`,
            'add',
            '--overwrite',
            '--yes',
            ...SHADCN_COMPONENTS,
        ],
        shadcnOptions,
    );
};

export const createAppHandler = async (
    name: string,
    options: CreateAppHandlerOptions,
): Promise<void> => {
    const startTime = Date.now();
    let success = false;
    GlobalState.setVerbose(options.verbose);
    const isChartType = options.chartType ?? false;
    const entityLabel = isChartType ? 'custom chart type' : 'data app';

    try {
        const slug = resolveLocalAppSlug(name, options.slug);
        const contentRoot = getDownloadFolder(options.path);
        const appDir = path.join(
            contentRoot,
            isChartType ? 'chart-types' : 'apps',
            slug,
        );
        await assertAppDirectoryAvailable(appDir);
        await assertNpmAvailable();

        // Validate auth, project, and slug availability before asking the
        // user to approve any local package installation.
        await checkLightdashVersion();
        const config = await getConfig();
        if (!config.context?.apiKey || !config.context.serverUrl) {
            throw new AuthorizationError(
                `Not logged in. Run 'lightdash login --help'`,
            );
        }

        const projectSelection = await selectProject(config, options.project);
        if (!projectSelection) {
            throw new LightdashError({
                message:
                    'No project selected. Run lightdash config set-project',
                name: 'Not Found',
                statusCode: 404,
                data: {},
            });
        }
        const { projectUuid } = projectSelection;
        logSelectedProject(projectSelection, config, 'Creating app for');

        const context = await lightdashApi<DataAppContext>({
            method: 'GET',
            url: `/api/v1/ee/projects/${projectUuid}/apps/authoring-context?slug=${encodeURIComponent(slug)}`,
            body: undefined,
        });

        await confirmLocalPackageTooling(
            options.assumeYes ?? false,
            entityLabel,
            !isChartType,
        );

        const staticFiles = buildStaticAuthoringFiles({
            appName: name,
            sdkVersion: CLI_VERSION,
            flavor: isChartType ? 'chart-type' : 'app',
        });
        await confirmDependencyInstall(
            parseDirectPackages(staticFiles),
            options.assumeYes ?? false,
            entityLabel,
            !isChartType,
        );
        const manifest = buildLocalAppManifest({
            name,
            description: options.description ?? '',
            projectUuid,
            slug,
            now: new Date(),
            chartType: isChartType,
        });
        const appsDir = path.dirname(appDir);
        await fs.mkdir(appsDir, { recursive: true });
        const temporaryAppDir = await fs.mkdtemp(
            path.join(appsDir, `.${slug}-`),
        );

        try {
            await writeBundleToDir(temporaryAppDir, {
                manifest,
                files: loadVendoredStarterSource(),
            });
            if (isChartType) {
                // Swap the app placeholder for the viz starter matching the
                // manifest's CHART_TYPE_STARTER_VIZ_SCHEMA declaration.
                await writeFilesToDir(temporaryAppDir, [
                    loadChartTypeStarterApp(),
                ]);
            }
            await writeFilesToDir(temporaryAppDir, staticFiles);
            await writeContextToDir(temporaryAppDir, context);
            await installDependenciesAndShadcn(temporaryAppDir, !isChartType);

            // shadcn rewrites package versions and tailwind colors while it
            // generates source. Restore the reviewed template declarations so
            // the approval list stays exact and uploads do not mistake the
            // generated app for one with custom dependencies.
            if (!isChartType) {
                await writeFilesToDir(
                    temporaryAppDir,
                    staticFiles.filter(
                        (file) =>
                            file.path === 'package.json' ||
                            file.path === 'tailwind.config.js',
                    ),
                );
            }
            await fs.rename(temporaryAppDir, appDir);
        } catch (error) {
            await fs.rm(temporaryAppDir, { recursive: true, force: true });
            throw error;
        }

        GlobalState.log(
            styles.success(`Created ${entityLabel} "${name}" at ${appDir}`),
        );
        GlobalState.log(
            isChartType
                ? `\nNext:\n  cd ${JSON.stringify(
                      appDir,
                  )}\n  lightdash apps validate --build\n  lightdash upload --chart-types ${slug} --path ${JSON.stringify(contentRoot)}\n\nThen open any explore in Lightdash and pick "${name}" in the chart type picker.`
                : `\nNext:\n  cd ${JSON.stringify(
                      appDir,
                  )}\n  npm run build\n  lightdash upload --apps ${slug} --path ${JSON.stringify(contentRoot)}`,
        );
        success = true;
    } finally {
        await LightdashAnalytics.track({
            event: 'command.executed',
            properties: {
                command: isChartType ? 'create-chart-type' : 'create-app',
                durationMs: Date.now() - startTime,
                success,
            },
        });
    }
};
