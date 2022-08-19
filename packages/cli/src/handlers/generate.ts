import { ParseError } from '@lightdash/common';
import { warehouseClientFromCredentials } from '@lightdash/warehouses';
import { promises as fs } from 'fs';
import inquirer from 'inquirer';
import * as yaml from 'js-yaml';
import ora from 'ora';
import * as path from 'path';
import { LightdashAnalytics } from '../analytics/analytics';
import { getDbtContext } from '../dbt/context';
import { loadManifest } from '../dbt/manifest';
import {
    findAndUpdateModelYaml,
    getCompiledModelsFromManifest,
    getWarehouseTableForModel,
} from '../dbt/models';
import {
    loadDbtTarget,
    warehouseCredentialsFromDbtTarget,
} from '../dbt/profile';
import * as styles from '../styles';

type GenerateHandlerOptions = {
    select: string[] | undefined;
    models: string[] | undefined;
    projectDir: string;
    profilesDir: string;
    target: string | undefined;
    profile: string | undefined;
    assumeYes: boolean;
    includeDimensionTypes: boolean;
};
export const generateHandler = async (options: GenerateHandlerOptions) => {
    const select = options.select || options.models;
    if (select === undefined && !options.assumeYes) {
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

    const numModelsSelected = select ? select.length : undefined;
    LightdashAnalytics.track({
        event: 'generate.started',
        properties: {
            trigger: 'generate',
            numModelsSelected,
        },
    });

    const absoluteProjectPath = path.resolve(options.projectDir);
    const absoluteProfilesPath = path.resolve(options.profilesDir);
    const context = await getDbtContext({ projectDir: absoluteProjectPath });
    const profileName = options.profile || context.profileName;
    const { target } = await loadDbtTarget({
        profilesDir: absoluteProfilesPath,
        profileName,
        targetName: options.target,
    });
    const credentials = await warehouseCredentialsFromDbtTarget(target);
    const warehouseClient = warehouseClientFromCredentials(credentials);
    const manifest = await loadManifest({ targetDir: context.targetDir });
    const compiledModels = getCompiledModelsFromManifest({
        projectName: context.projectName,
        selectors: select,
        manifest,
    });

    console.log(styles.info(`Generated .yml files:`));
    for await (const compiledModel of compiledModels) {
        const spinner = ora(
            `  Generating .yml for model ${styles.bold(compiledModel.name)}`,
        ).start();

        try {
            const table = await getWarehouseTableForModel({
                model: compiledModel,
                warehouseClient,
            });
            const { updatedYml, outputFilePath } = await findAndUpdateModelYaml(
                {
                    model: compiledModel,
                    table,
                    docs: manifest.docs,
                    includeDimensionTypes: options.includeDimensionTypes,
                    spinner,
                },
            );
            try {
                await fs.writeFile(
                    outputFilePath,
                    yaml.dump(updatedYml, { quotingType: '"' }),
                );
            } catch (e) {
                throw new ParseError(
                    `Failed to write file ${outputFilePath}\n ${e}`,
                );
            }
            spinner.succeed(
                `  ${styles.bold(compiledModel.name)}${styles.info(
                    ` ➡️  ${path.relative(process.cwd(), outputFilePath)}`,
                )}`,
            );
        } catch (e: any) {
            LightdashAnalytics.track({
                event: 'generate.error',
                properties: {
                    trigger: 'generate',
                    error: `${e.message}`,
                },
            });
            spinner.fail(`  Failed to generate ${compiledModel.name}.yml`);
            throw e;
        }
    }

    await LightdashAnalytics.track({
        event: 'generate.completed',
        properties: {
            trigger: 'generate',
            numModelsSelected,
        },
    });
};
