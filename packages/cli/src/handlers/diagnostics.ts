import { getErrorMessage } from '@lightdash/common';
import execa from 'execa';
import { LightdashAnalytics } from '../analytics/analytics';
import { getConfig } from '../config';
import {
    CLI_VERSION,
    DEFAULT_DBT_PROFILES_DIR,
    DEFAULT_DBT_PROJECT_DIR,
    NODE_VERSION,
    OPTIMIZED_NODE_VERSION,
} from '../env';
import GlobalState from '../globalState';
import * as styles from '../styles';
import { checkLightdashVersion, getUserContext } from './dbt/apiClient';
import { getDbtVersion } from './dbt/getDbtVersion';

type DiagnosticsOptions = {
    dbt?: boolean;
    projectDir?: string;
    profilesDir?: string;
    defer?: boolean;
    noDefer?: boolean;
    state?: string;
};

const getEnvSourceSuffix = (
    names: Array<keyof NodeJS.ProcessEnv>,
    env: NodeJS.ProcessEnv = process.env,
) => {
    const activeNames = names.filter((name) => !!env[name]);

    return activeNames.length > 0
        ? ` ${styles.secondary(`(Using ${activeNames.join(', ')})`)}`
        : '';
};

const formatConfiguredProject = (projectName: string, projectUuid: string) =>
    projectUuid === 'Not set' ? projectName : `${projectName} (${projectUuid})`;

const getAuthStatus = async () => {
    try {
        const config = await getConfig();
        const serverUrl = config.context?.serverUrl || 'Not set';
        const organizationUuid = config.user?.organizationUuid || 'Not set';
        const projectName = config.context?.projectName || 'Not set';
        const projectUuid = config.context?.project || 'Not set';

        if (!(config.context?.apiKey && config.context?.serverUrl)) {
            return {
                status: 'missing_credentials' as const,
                serverUrl,
                organizationUuid,
                projectName,
                projectUuid,
            };
        }

        try {
            const user = await getUserContext();

            return {
                status: 'authenticated' as const,
                serverUrl,
                organizationUuid: user.organizationUuid || organizationUuid,
                projectName,
                projectUuid,
            };
        } catch (error) {
            return {
                status: 'auth_failed' as const,
                serverUrl,
                organizationUuid,
                projectName,
                projectUuid,
                error: getErrorMessage(error),
            };
        }
    } catch (error) {
        return {
            status: 'missing_credentials' as const,
            serverUrl: 'Error reading config',
            organizationUuid: 'Error reading config',
            projectName: 'Error reading config',
            projectUuid: 'Error reading config',
        };
    }
};

const runDbtDebug = async (
    projectDir: string,
    profilesDir: string,
    options: {
        defer?: boolean;
        noDefer?: boolean;
        state?: string;
    } = {},
) => {
    try {
        const args = [
            'debug',
            '--project-dir',
            projectDir,
            '--profiles-dir',
            profilesDir,
        ];

        if (options.defer) {
            args.push('--defer');
        }
        if (options.noDefer) {
            args.push('--no-defer');
        }
        if (options.state) {
            args.push('--state', options.state);
        }

        const { all } = await execa('dbt', args, {
            all: true,
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        return all || '';
    } catch (error) {
        const msg = getErrorMessage(error);
        return `Error running dbt debug: ${msg}`;
    }
};

export const diagnosticsHandler = async (options: DiagnosticsOptions) => {
    const startTime = Date.now();
    let success = true;
    GlobalState.setVerbose(true); // Always verbose for diagnostics

    try {
        console.log(styles.title('⚡️ Lightdash CLI Diagnostics'));
        console.log('');

        // CLI Version
        console.log(styles.bold('Lightdash CLI Version:'));
        console.log(`  ${CLI_VERSION}`);
        await checkLightdashVersion();
        console.log('');

        // Node.js Version
        console.log(styles.bold('Node.js Version:'));
        console.log(`  ${NODE_VERSION.major}`);
        if (NODE_VERSION.major !== OPTIMIZED_NODE_VERSION) {
            console.log(
                styles.warning(
                    `  ⚠️ You are using Node.js version ${process.version}. Lightdash CLI is optimized for v${OPTIMIZED_NODE_VERSION} so you might experience issues.`,
                ),
            );
        }
        console.log('');

        // Auth Status
        console.log(styles.bold('Authentication Status:'));
        const authStatus = await getAuthStatus();
        const authSourceSuffix = getEnvSourceSuffix([
            'LIGHTDASH_API_KEY',
            'LIGHTDASH_PROXY_AUTHORIZATION',
        ]);
        const instanceSourceSuffix = getEnvSourceSuffix(['LIGHTDASH_URL']);
        const projectSourceSuffix = getEnvSourceSuffix(['LIGHTDASH_PROJECT']);

        if (authStatus.status === 'authenticated') {
            console.log(
                `  ✅ Authenticated (verified with server)${authSourceSuffix}`,
            );
            console.log(
                `  Instance: ${authStatus.serverUrl}${instanceSourceSuffix}`,
            );
            console.log(`  Organization: ${authStatus.organizationUuid}`);
            console.log(
                `  Configured project: ${formatConfiguredProject(
                    authStatus.projectName,
                    authStatus.projectUuid,
                )}${projectSourceSuffix}`,
            );
        } else if (authStatus.status === 'auth_failed') {
            console.log(`  ❌ Authentication check failed${authSourceSuffix}`);
            console.log(
                `  Instance: ${authStatus.serverUrl}${instanceSourceSuffix}`,
            );
            if (authStatus.organizationUuid !== 'Not set') {
                console.log(
                    `  Stored organization: ${authStatus.organizationUuid}`,
                );
            }
            console.log(
                `  Configured project: ${formatConfiguredProject(
                    authStatus.projectName,
                    authStatus.projectUuid,
                )}${projectSourceSuffix}`,
            );
            console.log(`  Error: ${authStatus.error}`);
        } else {
            console.log(`  ❌ Not authenticated${authSourceSuffix}`);
            console.log(
                `  Instance: ${authStatus.serverUrl}${instanceSourceSuffix}`,
            );
            console.log(
                `  Configured project: ${formatConfiguredProject(
                    authStatus.projectName,
                    authStatus.projectUuid,
                )}${projectSourceSuffix}`,
            );
        }
        console.log('');

        // dbt Debug (if --dbt flag is provided)
        if (options.dbt) {
            console.log(styles.bold('dbt Debug:'));

            // First get dbt version
            try {
                const dbtVersion = await getDbtVersion();
                console.log(`  dbt Version: ${dbtVersion.verboseVersion}`);
                console.log('');
            } catch (error) {
                console.log(
                    `  Error getting dbt version: ${getErrorMessage(error)}`,
                );
                console.log('');
            }

            // Then run dbt debug
            const projectDir = options.projectDir || DEFAULT_DBT_PROJECT_DIR;
            const profilesDir = options.profilesDir || DEFAULT_DBT_PROFILES_DIR;

            let debugCommand = `dbt debug --project-dir ${projectDir} --profiles-dir ${profilesDir}`;
            if (options.defer) debugCommand += ' --defer';
            if (options.noDefer) debugCommand += ' --no-defer';
            if (options.state) debugCommand += ` --state ${options.state}`;

            console.log(`  Running: ${debugCommand}`);
            console.log('');

            const debugOutput = await runDbtDebug(projectDir, profilesDir, {
                defer: options.defer,
                noDefer: options.noDefer,
                state: options.state,
            });
            console.log(debugOutput);
        }
    } catch (e) {
        success = false;
        throw e;
    } finally {
        await LightdashAnalytics.track({
            event: 'command.executed',
            properties: {
                command: 'diagnostics',
                durationMs: Date.now() - startTime,
                success,
            },
        });
    }
};
