import {
    getErrorMessage,
    getModelsFromManifest,
    ParseError,
} from '@lightdash/common';
import { promises as fs } from 'fs';
import inquirer from 'inquirer';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { LightdashAnalytics } from '../analytics/analytics';
import { getDbtContext } from '../dbt/context';
import { loadManifest } from '../dbt/manifest';
import {
    findAndUpdateModelYaml,
    getCompiledModels,
    getWarehouseTableForModel,
} from '../dbt/models';
import GlobalState from '../globalState';
import * as styles from '../styles';
import { CompileHandlerOptions } from './compile';
import { checkLightdashVersion } from './dbt/apiClient';
import { getDbtVersion } from './dbt/getDbtVersion';
import getWarehouseClient from './dbt/getWarehouseClient';

type GenerateHandlerOptions = CompileHandlerOptions & {
    select: string[] | undefined;
    exclude: string[] | undefined;
    models: string[] | undefined;
    assumeYes: boolean;
    excludeMeta: boolean;
    skipExisting?: boolean;
    preserveColumnCase: boolean;
};

export const generateHandler = async (options: GenerateHandlerOptions) => {
    GlobalState.setVerbose(options.verbose);
    await checkLightdashVersion();
    const executionId = uuidv4();
    if (
        options.select === undefined &&
        options.exclude === undefined &&
        !options.assumeYes
    ) {
        const answers = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'isConfirm',
                message:
                    'Are you sure you want to generate .yml for all models in project?',
            },
        ]);
        if (!answers.isConfirm) {
            return;
        }
    }

    const numModelsSelected = (options.select || options.models)?.length;
    await LightdashAnalytics.track({
        event: 'generate.started',
        properties: {
            executionId,
            trigger: 'generate',
            numModelsSelected,
        },
    });

    const absoluteProjectPath = path.resolve(options.projectDir);

    const context = await getDbtContext({
        projectDir: absoluteProjectPath,
    });
    const profileName = options.profile || context.profileName;

    const dbtVersion = await getDbtVersion();
    const { warehouseClient } = await getWarehouseClient({
        isDbtCloudCLI: dbtVersion.isDbtCloudCLI,
        profilesDir: options.profilesDir,
        profile: options.profile || context.profileName,
        target: options.target,
        startOfWeek: options.startOfWeek,
    });
    const manifest = await loadManifest({ targetDir: context.targetDir });
    const models = getModelsFromManifest(manifest);
    const compiledModels = await getCompiledModels(models, {
        projectDir: dbtVersion.isDbtCloudCLI ? undefined : absoluteProjectPath,
        profilesDir: dbtVersion.isDbtCloudCLI
            ? undefined
            : path.resolve(options.profilesDir),
        profile: dbtVersion.isDbtCloudCLI ? undefined : profileName,
        target: options.target,
        select: options.select || options.models,
        exclude: options.exclude,
        vars: options.vars || undefined,
    });
    GlobalState.debug(`> Compiled models: ${compiledModels.length}`);

    console.info(styles.info(`Generated .yml files:`));
    for await (const compiledModel of compiledModels) {
        const spinner = GlobalState.startSpinner(
            `  Generating .yml for model ${styles.bold(compiledModel.name)}`,
        );
        try {
            const table = await getWarehouseTableForModel({
                model: compiledModel,
                warehouseClient,
                preserveColumnCase: options.preserveColumnCase,
            });
            const { updatedYml, outputFilePath } = await findAndUpdateModelYaml(
                {
                    model: compiledModel,
                    table,
                    docs: manifest.docs,
                    includeMeta: !options.excludeMeta,
                    projectDir: absoluteProjectPath,
                    projectName: context.projectName,
                    assumeYes: options.assumeYes,
                },
            );
            try {
                if (options.skipExisting) {
                    try {
                        await fs.access(outputFilePath);

                        spinner.warn(
                            `  already exists ${styles.bold(
                                compiledModel.name,
                            )}${styles.info(
                                ` ➡️  ${path.relative(
                                    process.cwd(),
                                    outputFilePath,
                                )} `,
                            )}`,
                        );
                        // eslint-disable-next-line no-continue
                        continue; // Skip this file if it already exists
                    } catch {
                        // File does not exist, we continue
                    }
                }

                const outputDirPath = path.dirname(outputFilePath);
                // Create a directory if it doesn't exist
                try {
                    await fs.access(outputDirPath);
                } catch (error) {
                    await fs.mkdir(outputDirPath, { recursive: true });
                }

                await fs.writeFile(
                    outputFilePath,
                    updatedYml.toString({
                        quoteChar: '"',
                    }),
                );
            } catch (e) {
                const msg = getErrorMessage(e);
                throw new ParseError(
                    `Failed to write file ${outputFilePath}\n ${msg}`,
                );
            }
            spinner.succeed(
                `  ${styles.bold(compiledModel.name)}${styles.info(
                    ` ➡️  ${path.relative(process.cwd(), outputFilePath)}`,
                )}`,
            );
        } catch (e: unknown) {
            const msg = getErrorMessage(e);
            await LightdashAnalytics.track({
                event: 'generate.error',
                properties: {
                    executionId,
                    trigger: 'generate',
                    error: `${msg}`,
                },
            });
            spinner.fail(`  Failed to generate ${compiledModel.name}.yml`);
            throw e;
        }
    }

    await LightdashAnalytics.track({
        event: 'generate.completed',
        properties: {
            executionId,
            trigger: 'generate',
            numModelsSelected,
        },
    });
};
