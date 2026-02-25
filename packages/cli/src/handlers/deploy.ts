import {
    AuthorizationError,
    DeploySessionStatus,
    Explore,
    ExploreError,
    friendlyName,
    getErrorMessage,
    isExploreError,
    ParseError,
    Project,
    ProjectType,
    type LightdashProjectConfig,
    type Tag,
} from '@lightdash/common';
import inquirer from 'inquirer';
import path from 'path';
import { URL } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { LightdashAnalytics } from '../analytics/analytics';
import { getConfig, setProject } from '../config';
import { getDbtContext } from '../dbt/context';
import GlobalState from '../globalState';
import { readAndLoadLightdashProjectConfig } from '../lightdash-config';
import { CliProjectType, detectProjectType } from '../lightdash/projectType';
import * as styles from '../styles';
import { compile } from './compile';
import {
    createProject,
    resolveOrganizationCredentialsName,
} from './createProject';
import { checkLightdashVersion, lightdashApi } from './dbt/apiClient';
import { DbtCompileOptions } from './dbt/compile';
import { tryGetDbtVersion } from './dbt/getDbtVersion';
import { logSelectedProject, selectProject } from './selectProject';

type DeployHandlerOptions = DbtCompileOptions & {
    projectDir: string;
    profilesDir: string;
    target: string | undefined;
    profile: string | undefined;
    create?: boolean | string;
    verbose: boolean;
    ignoreErrors: boolean;
    startOfWeek?: number;
    warehouseCredentials?: boolean;
    organizationCredentials?: string;
    assumeYes?: boolean;
    useBatchedDeploy?: boolean;
    batchSize?: string;
    parallelBatches?: string;
};

type DeployArgs = DeployHandlerOptions & {
    projectUuid: string;
};

const replaceProjectYamlTags = async (
    projectUuid: string,
    lightdashProjectConfig: LightdashProjectConfig,
) => {
    const yamlTags: (Pick<Tag, 'name' | 'color'> & {
        yamlReference: NonNullable<Tag['yamlReference']>;
    })[] = Object.entries(
        lightdashProjectConfig.spotlight?.categories ?? {},
    ).map(([yamlReference, category]) => ({
        yamlReference,
        name: category.label,
        color: category.color ?? 'gray',
    }));

    await lightdashApi<null>({
        method: 'PUT',
        url: `/api/v1/projects/${projectUuid}/tags/yaml`,
        body: JSON.stringify(yamlTags),
    });
};

const replaceProjectParameters = async (
    projectUuid: string,
    lightdashProjectConfig: LightdashProjectConfig,
) => {
    await lightdashApi<null>({
        method: 'PUT',
        url: `/api/v2/projects/${projectUuid}/parameters`,
        body: JSON.stringify(lightdashProjectConfig.parameters ?? {}),
    });
};

const deployBatched = async (
    explores: (Explore | ExploreError)[],
    options: DeployArgs,
): Promise<void> => {
    const batchSize = parseInt(options.batchSize || '50', 10);
    if (Number.isNaN(batchSize) || batchSize < 1 || batchSize > 1000) {
        throw new Error(
            'batchSize must be a positive integer between 1 and 1000',
        );
    }
    const parallelBatches = parseInt(options.parallelBatches || '1', 10);
    if (
        Number.isNaN(parallelBatches) ||
        parallelBatches < 1 ||
        parallelBatches > 50
    ) {
        throw new Error(
            'parallelBatches must be a positive integer between 1 and 50',
        );
    }

    GlobalState.log(
        styles.title(
            `Deploying ${explores.length} explores using batched deploy (batch size: ${batchSize}, parallel: ${parallelBatches})`,
        ),
    );

    const deployStartTime = Date.now();

    // Start deploy session
    GlobalState.log(`Starting deploy session...`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const startSessionResponse = (await lightdashApi<any>({
        method: 'POST',
        url: `/api/v2/projects/${options.projectUuid}/deploy`,
        body: JSON.stringify({}),
    })) as { deploySessionUuid: string };

    const sessionUuid = startSessionResponse.deploySessionUuid;
    GlobalState.log(styles.success(`Deploy session created: ${sessionUuid}`));

    // Split explores into batches
    const batches: (Explore | ExploreError)[][] = [];
    for (let i = 0; i < explores.length; i += batchSize) {
        batches.push(explores.slice(i, i + batchSize));
    }

    GlobalState.log(`Uploading ${batches.length} batches...`);

    // Send batches with parallelism using chunked processing
    const uploadBatch = async (
        batch: (Explore | ExploreError)[],
        batchIndex: number,
    ) => {
        GlobalState.log(
            `  Uploading batch ${batchIndex + 1}/${batches.length} (${batch.length} explores)...`,
        );

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const response = (await lightdashApi<any>({
            method: 'POST',
            url: `/api/v2/projects/${options.projectUuid}/deploy/${sessionUuid}/batch`,
            body: JSON.stringify({
                explores: batch,
                batchNumber: batchIndex,
            }),
        })) as { batchNumber: number; exploreCount: number };

        GlobalState.log(
            styles.success(
                `  ✓ Batch ${batchIndex + 1} uploaded (${response.exploreCount} explores)`,
            ),
        );

        return response;
    };

    // Process batches with controlled parallelism using recursive approach
    const processBatchesWithParallelism = async (
        remainingIndices: number[],
        results: { batchNumber: number; exploreCount: number }[] = [],
    ): Promise<{ batchNumber: number; exploreCount: number }[]> => {
        if (remainingIndices.length === 0) {
            return results;
        }

        const chunk = remainingIndices.slice(0, parallelBatches);
        const remaining = remainingIndices.slice(parallelBatches);

        const chunkPromises = chunk.map((index) =>
            uploadBatch(batches[index], index),
        );
        const chunkResults = await Promise.all(chunkPromises);

        return processBatchesWithParallelism(remaining, [
            ...results,
            ...chunkResults,
        ]);
    };

    const batchIndices = Array.from({ length: batches.length }, (_, i) => i);
    await processBatchesWithParallelism(batchIndices);

    // Finalize deploy
    GlobalState.log(`Finalizing deploy...`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const finalizeResponse = (await lightdashApi<any>({
        method: 'POST',
        url: `/api/v2/projects/${options.projectUuid}/deploy/${sessionUuid}/finalize`,
        body: JSON.stringify({}),
    })) as { exploreCount: number; status: DeploySessionStatus };

    GlobalState.log(
        styles.success(
            `Deploy completed! ${finalizeResponse.exploreCount} explores deployed.`,
        ),
    );

    await LightdashAnalytics.track({
        event: 'deploy.triggered',
        properties: {
            projectId: options.projectUuid,
            durationMs: Date.now() - deployStartTime,
        },
    });
};

export const deploy = async (
    explores: (Explore | ExploreError)[],
    options: DeployArgs,
): Promise<void> => {
    if (explores.length === 0) {
        GlobalState.log(styles.warning('No explores found'));
        process.exit(1);
    }

    const errors = explores.filter((e) => isExploreError(e)).length;
    if (errors > 0) {
        if (options.ignoreErrors) {
            console.error(
                styles.warning(`\nDeploying project with ${errors} errors\n`),
            );
        } else {
            console.error(
                styles.error(
                    `Can't deploy with errors. If you still want to deploy, add ${styles.bold(
                        '--ignore-errors',
                    )} flag`,
                ),
            );
            process.exit(1);
        }
    }

    const lightdashProjectConfig = await readAndLoadLightdashProjectConfig(
        path.resolve(options.projectDir),
        options.projectUuid,
    );

    // These two methods are not critical to the deployment process, so we can ignore errors and show warnings instead
    try {
        await replaceProjectYamlTags(
            options.projectUuid,
            lightdashProjectConfig,
        );
    } catch (e) {
        console.error(
            styles.warning(
                `\nError replacing YAML tags: ${getErrorMessage(e)}\n`,
            ),
        );
    }

    try {
        await replaceProjectParameters(
            options.projectUuid,
            lightdashProjectConfig,
        );
    } catch (e) {
        console.error(
            styles.warning(
                `\nError replacing project parameters: ${getErrorMessage(e)}\n`,
            ),
        );
    }

    // Use batched deploy if enabled
    if (options.useBatchedDeploy) {
        await deployBatched(explores, options);
    } else {
        const deployStartTime = Date.now();
        const deployPayload = JSON.stringify(explores);
        try {
            await lightdashApi<null>({
                method: 'PUT',
                url: `/api/v1/projects/${options.projectUuid}/explores`,
                body: deployPayload,
            });
            await LightdashAnalytics.track({
                event: 'deploy.triggered',
                properties: {
                    projectId: options.projectUuid,
                    durationMs: Date.now() - deployStartTime,
                    payloadSizeBytes: Buffer.byteLength(deployPayload),
                },
            });
        } catch (error: unknown) {
            // Check if it's a payload too large error (413) or similar size-related errors
            const errorStatus = (error as { status?: number }).status;
            const errorMessage = (error as { message?: string }).message;
            if (
                errorStatus === 413 ||
                errorMessage?.includes('too large') ||
                errorMessage?.includes('payload') ||
                errorMessage?.includes('Request Entity Too Large') ||
                errorMessage?.includes('413')
            ) {
                console.error(
                    styles.error('\n❌ Deploy failed: Payload too large\n'),
                );
                console.error(
                    styles.warning(
                        'Your project is too large to deploy in a single request.\n' +
                            'Please use the batched deploy feature:\n\n' +
                            `  ${styles.bold('lightdash deploy --use-batched-deploy')}\n\n` +
                            'You can also customize batch size and parallelism:\n' +
                            `  ${styles.bold('--batch-size <number>')}      Number of explores per batch (default: 50)\n` +
                            `  ${styles.bold('--parallel-batches <number>')} Number of parallel batches (default: 1)\n`,
                    ),
                );
                process.exit(1);
            }
            // Re-throw other errors to be handled by the caller
            throw error;
        }
    }
};

const createNewProject = async (
    executionId: string,
    options: DeployHandlerOptions,
): Promise<Project | undefined> => {
    console.error('');
    const absoluteProjectPath = path.resolve(options.projectDir);

    let defaultProjectName: string = 'My new Lightdash Project'; // TODO: improve
    try {
        const context = await getDbtContext({
            projectDir: absoluteProjectPath,
            targetPath: options.targetPath,
        });
        defaultProjectName = friendlyName(context.projectName);
    } catch (e) {
        if (e instanceof ParseError) {
            // stick with default name
        }
    }

    // If interactive and no name provided, prompt for project name
    let projectName = defaultProjectName;
    if (options.create === true && !GlobalState.isNonInteractive()) {
        const answers = await inquirer.prompt([
            {
                type: 'input',
                name: 'name',
                message: `Add a project name or press enter to use the default: [${defaultProjectName}] `,
            },
        ]);
        projectName = answers.name ? answers.name : defaultProjectName;
    }
    // If explicit name provided, use it
    if (typeof options.create === 'string') {
        projectName = options.create;
    }

    projectName = projectName.trim();

    // Create the project
    console.error('');
    const spinner = GlobalState.startSpinner(
        `  Creating new project ${styles.bold(projectName)}`,
    );
    const createStartTime = Date.now();
    await LightdashAnalytics.track({
        event: 'create.started',
        properties: {
            executionId,
            projectName,
            isDefaultName: defaultProjectName === projectName,
        },
    });
    try {
        const results = await createProject({
            ...options,
            name: projectName,
            type: ProjectType.DEFAULT,
            warehouseCredentials: options.warehouseCredentials,
            assumeYes: options.assumeYes,
        });

        const project = results?.project;

        if (!project) {
            spinner.fail('Cancel preview environment');
            return undefined;
        }
        spinner.succeed(`  New project ${styles.bold(projectName)} created\n`);

        await LightdashAnalytics.track({
            event: 'create.completed',
            properties: {
                executionId,
                projectId: project.projectUuid,
                projectName,
                durationMs: Date.now() - createStartTime,
            },
        });

        return project;
    } catch (e) {
        await LightdashAnalytics.track({
            event: 'create.error',
            properties: {
                executionId,
                error: `Error creating developer preview ${e}`,
            },
        });

        spinner.fail();
        throw e;
    }
};

export const deployHandler = async (originalOptions: DeployHandlerOptions) => {
    const options = {
        ...originalOptions,
    };
    GlobalState.setVerbose(options.verbose);

    // Detect project type and configure options accordingly
    const projectTypeConfig = await detectProjectType({
        projectDir: options.projectDir,
        userOptions: {
            warehouseCredentials: options.warehouseCredentials,
            skipDbtCompile: options.skipDbtCompile,
            skipWarehouseCatalog: options.skipWarehouseCatalog,
        },
    });

    // Apply project type configuration to options
    options.warehouseCredentials = projectTypeConfig.warehouseCredentials;
    options.skipDbtCompile = projectTypeConfig.skipDbtCompile;
    options.skipWarehouseCatalog = projectTypeConfig.skipWarehouseCatalog;

    // Resolve organization credentials early before doing any heavy work
    if (options.organizationCredentials) {
        try {
            await resolveOrganizationCredentialsName(
                options.organizationCredentials,
            );
        } catch (error) {
            console.error(
                styles.error(
                    error instanceof Error ? error.message : 'Unknown error',
                ),
            );
            process.exit(1);
        }
    }

    // Only check dbt version for dbt projects (YAML-only projects don't need dbt)
    // For YAML-only projects, we return success: false to indicate dbt wasn't checked,
    // with null error since this is expected behavior, not an error condition.
    // This allows downstream code to distinguish "dbt check skipped" from "dbt check failed".
    const dbtVersionResult =
        projectTypeConfig.type === CliProjectType.Dbt
            ? await tryGetDbtVersion()
            : { success: false as const, error: null };
    await checkLightdashVersion();
    const executionId = uuidv4();
    const explores = await compile(options);

    const config = await getConfig();
    let projectUuid: string;

    if (options.create !== undefined) {
        const project = await createNewProject(executionId, options);
        if (!project) {
            console.error(
                "To preview your project, you'll need to manually enter your warehouse connection details.",
            );
            const createProjectUrl =
                config.context?.serverUrl &&
                new URL('/createProject', config.context.serverUrl);
            if (createProjectUrl) {
                console.error(
                    `Fill out the project connection form here: ${createProjectUrl}`,
                );
            }
            return;
        }
        projectUuid = project.projectUuid;
        await setProject(projectUuid, project.name);
    } else {
        if (!config.context?.serverUrl) {
            throw new AuthorizationError(
                `No active Lightdash project. Run 'lightdash login --help'`,
            );
        }
        const projectSelection = await selectProject(config);
        if (!projectSelection) {
            throw new AuthorizationError(
                `No active Lightdash project. Run 'lightdash login --help'`,
            );
        }
        projectUuid = projectSelection.projectUuid;

        // Log current project info
        logSelectedProject(projectSelection, config, 'Deploying to');
    }

    await deploy(explores, { ...options, projectUuid });

    const serverUrl = config.context?.serverUrl?.replace(/\/$/, '');
    let displayUrl = options.create
        ? `${serverUrl}/createProject/cli?projectUuid=${projectUuid}`
        : `${serverUrl}/projects/${projectUuid}/home`;
    let successMessage = 'Successfully deployed project:';
    if (
        dbtVersionResult.success &&
        dbtVersionResult.version.isDbtCloudCLI &&
        options.create
    ) {
        successMessage =
            'Successfully deployed project! Complete the setup by adding warehouse connection details here:';
        displayUrl = `${serverUrl}/generalSettings/projectManagement/${projectUuid}/settings`;
    }
    console.error(`${styles.bold(successMessage)}`);
    console.error('');
    console.error(`      ${styles.bold(`⚡️ ${displayUrl}`)}`);
    console.error('');
};
