import { ParseError } from '@lightdash/common';
import { warehouseClientFromCredentials } from '@lightdash/warehouses';
import { promises as fs } from 'fs';
import inquirer from 'inquirer';
import * as yaml from 'js-yaml';
import ora from 'ora';
import * as path from 'path';
import { getDbtContext } from '../dbt/context';
import { loadManifest } from '../dbt/manifest';
import {
    getCompiledModelsFromManifest,
    getWarehouseTableForModel,
    updateModelYmlFile,
} from '../dbt/models';
import {
    loadDbtTarget,
    warehouseCredentialsFromDbtTarget,
} from '../dbt/profile';
import * as styles from '../styles';

type GenerateHandlerOptions = {
    select: string[] | undefined;
    projectDir: string;
    profilesDir: string;
    target: string | undefined;
    profile: string | undefined;
};
export const generateHandler = async (options: GenerateHandlerOptions) => {
    if (options.select === undefined) {
        const answers = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'isConfirm',
                message:
                    'Are you sure you want to generate .yml for all models in project?',
            },
        ]);
        if (!answers.confirm) {
            return;
        }
    }
    const absoluteProjectPath = path.resolve(options.projectDir);
    const absoluteProfilesPath = path.resolve(options.profilesDir);
    const context = await getDbtContext({ projectDir: absoluteProjectPath });
    const profileName = options.profile || context.profileName;
    const target = await loadDbtTarget({
        profilesDir: absoluteProfilesPath,
        profileName,
        targetName: options.target,
    });
    const credentials = await warehouseCredentialsFromDbtTarget(target);
    const warehouseClient = warehouseClientFromCredentials(credentials);
    const manifest = await loadManifest({ targetDir: context.targetDir });
    const compiledModels = getCompiledModelsFromManifest({
        projectName: context.projectName,
        selectors: options.select,
        manifest,
    });

    console.log(styles.info(`Generated .yml files:`));
    // eslint-disable-next-line no-restricted-syntax
    for await (const compiledModel of compiledModels) {
        const spinner = ora(
            `  Generating .yml for model ${styles.bold(compiledModel.name)}`,
        ).start();
        try {
            const table = await getWarehouseTableForModel({
                model: compiledModel,
                warehouseClient,
            });
            const { updatedYml, outputFilePath } = await updateModelYmlFile({
                model: compiledModel,
                table,
            });
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
        } catch (e) {
            spinner.fail(`  Failed to generate ${compiledModel.name}.yml`);
            throw e;
        }
    }
};
