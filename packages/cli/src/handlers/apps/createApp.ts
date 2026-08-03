import {
    AuthorizationError,
    generateSlug,
    isValidDataAppSlug,
    LightdashError,
    ParameterError,
    type DataAppContext,
    type DataAppManifest,
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
    loadVendoredStarterSource,
} from './scaffolding';

export type CreateAppHandlerOptions = {
    assumeYes?: boolean;
    description?: string;
    path?: string;
    project?: string;
    slug?: string;
    verbose: boolean;
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
}): DataAppManifest => ({
    codeVersion: 1,
    projectUuid: args.projectUuid,
    slug: args.slug,
    version: 1,
    name: args.name,
    description: args.description,
    template: null,
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
): Promise<void> => {
    GlobalState.log(
        styles.warning(
            [
                '⚠ Local package installation',
                `Creating a data app downloads third-party packages through npm into the new app folder and runs shadcn@${SHADCN_VERSION} to generate UI files.`,
                'Dependency lifecycle scripts are disabled, but npm and shadcn will access the network and write files on this machine.',
                'Only continue if you trust these package sources and are comfortable running this tooling locally.',
            ].join('\n'),
        ),
    );

    if (assumeYes) return;
    if (GlobalState.isNonInteractive()) {
        throw new ParameterError(
            'Creating a data app requires approval to download and install npm packages. Rerun with --assume-yes to approve in non-interactive mode.',
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
): Promise<void> => {
    GlobalState.log(
        [
            'Creating this data app will install these direct npm packages:',
            ...directPackages.map((packageSpec) => `  - ${packageSpec}`),
            `\nIt will also run shadcn@${SHADCN_VERSION} to generate:`,
            `  ${SHADCN_COMPONENTS.join(', ')}`,
            "\nDependency lifecycle scripts will be disabled. React 19 peer dependencies will use npm's legacy-peer-deps mode.",
        ].join('\n'),
    );

    if (assumeYes) return;
    if (GlobalState.isNonInteractive()) {
        throw new ParameterError(
            'Creating a data app requires approval to install npm packages. Rerun with --assume-yes to approve in non-interactive mode.',
        );
    }

    const { confirmed } = await inquirer.prompt<{ confirmed: boolean }>([
        {
            type: 'confirm',
            name: 'confirmed',
            message: 'Install these packages and create the app?',
            default: false,
        },
    ]);
    if (!confirmed) {
        throw new ParameterError('Data app creation cancelled.');
    }
};

const installDependenciesAndShadcn = async (appDir: string): Promise<void> => {
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

    try {
        const slug = resolveLocalAppSlug(name, options.slug);
        const appDir = path.join(getDownloadFolder(options.path), 'apps', slug);
        await assertAppDirectoryAvailable(appDir);
        await assertNpmAvailable();
        await confirmLocalPackageTooling(options.assumeYes ?? false);

        const staticFiles = buildStaticAuthoringFiles({
            appName: name,
            sdkVersion: CLI_VERSION,
        });
        await confirmDependencyInstall(
            parseDirectPackages(staticFiles),
            options.assumeYes ?? false,
        );

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
        const manifest = buildLocalAppManifest({
            name,
            description: options.description ?? '',
            projectUuid,
            slug,
            now: new Date(),
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
            await writeFilesToDir(temporaryAppDir, staticFiles);
            await writeContextToDir(temporaryAppDir, context);
            await installDependenciesAndShadcn(temporaryAppDir);

            // shadcn rewrites package versions and tailwind colors while it
            // generates source. Restore the reviewed template declarations so
            // the approval list stays exact and uploads do not mistake the
            // generated app for one with custom dependencies.
            await writeFilesToDir(
                temporaryAppDir,
                staticFiles.filter(
                    (file) =>
                        file.path === 'package.json' ||
                        file.path === 'tailwind.config.js',
                ),
            );
            await fs.rename(temporaryAppDir, appDir);
        } catch (error) {
            await fs.rm(temporaryAppDir, { recursive: true, force: true });
            throw error;
        }

        GlobalState.log(
            styles.success(`Created data app "${name}" at ${appDir}`),
        );
        GlobalState.log(
            `\nNext:\n  cd ${JSON.stringify(appDir)}\n  npm run build\n  lightdash upload --apps ${slug}`,
        );
        success = true;
    } finally {
        await LightdashAnalytics.track({
            event: 'command.executed',
            properties: {
                command: 'create-app',
                durationMs: Date.now() - startTime,
                success,
            },
        });
    }
};
