import { ParseError } from '@lightdash/common';
import { warehouseClientFromCredentials } from '@lightdash/warehouses';
import { writeFileSync } from 'fs';
import ora from 'ora';
import * as path from 'path';
import { getDbtContext } from '../dbt/context';
import { loadManifest } from '../dbt/manifest';
import {
    generateSchemaFileForModel,
    getCompiledModelFromManifest,
    getWarehouseTableForModel,
} from '../dbt/models';
import {
    loadDbtTarget,
    warehouseCredentialsFromDbtTarget,
} from '../dbt/profile';
import * as styles from '../styles';

type GenerateHandlerOptions = {
    projectDir: string;
    profilesDir: string;
    target: string | undefined;
    profile: string | undefined;
};
export const generateHandler = async (
    model: string,
    options: GenerateHandlerOptions,
) => {
    console.log(styles.info(`Generated .yml files:`));
    const spinner = ora(
        `  Generating .yml for model ${styles.bold(model)}`,
    ).start();
    try {
        const absoluteProjectPath = path.resolve(options.projectDir);
        const absoluteProfilesPath = path.resolve(options.profilesDir);
        const context = getDbtContext({ projectDir: absoluteProjectPath });
        const profileName = options.profile || context.profileName;
        const target = loadDbtTarget({
            profilesDir: absoluteProfilesPath,
            profileName,
            targetName: options.target,
        });
        const credentials = warehouseCredentialsFromDbtTarget(target);
        const warehouseClient = warehouseClientFromCredentials(credentials);
        const manifest = loadManifest({ targetDir: context.targetDir });
        const compiledModel = getCompiledModelFromManifest({
            projectName: context.projectName,
            modelName: model,
            manifest,
        });
        const table = await getWarehouseTableForModel({
            model: compiledModel,
            warehouseClient,
        });
        const schemaFile = generateSchemaFileForModel({
            modelName: model,
            table,
        });
        const outputDir = path.dirname(
            path.join(compiledModel.rootPath, compiledModel.originalFilePath),
        );
        const outputPath = path.join(outputDir, `${model}.yml`);
        try {
            writeFileSync(outputPath, schemaFile, { flag: 'wx' });
        } catch (e) {
            throw new ParseError(
                `Could not write generated schema file to ${outputPath}\n  ${e}`,
            );
        }
        spinner.succeed(
            `  ${styles.bold(model)}${styles.info(
                ` ➡️${path.relative(process.cwd(), outputPath)}`,
            )}`,
        );
    } catch (e) {
        spinner.fail(`  Failed to generate ${model}.yml`);
        throw e;
    }
};
