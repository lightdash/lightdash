import { AuthorizationError, DbtExposure } from '@lightdash/common';
import { promises as fs } from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { LightdashAnalytics } from '../analytics/analytics';
import { getConfig } from '../config';
import GlobalState from '../globalState';
import * as styles from '../styles';
import { checkLightdashVersion, lightdashApi } from './dbt/apiClient';

type GenerateExposuresHandlerOptions = {
    projectDir: string;
    verbose: boolean;
    output?: string;
};

export const generateExposuresHandler = async (
    options: GenerateExposuresHandlerOptions,
) => {
    GlobalState.setVerbose(options.verbose);
    await checkLightdashVersion();
    const executionId = uuidv4();
    const config = await getConfig();
    if (!(config.context?.project && config.context.serverUrl)) {
        throw new AuthorizationError(
            `No active Lightdash project. Run 'lightdash login --help'`,
        );
    }

    await LightdashAnalytics.track({
        event: 'generate_exposures.started',
        properties: {
            executionId,
        },
    });

    console.info(
        styles.warning(
            `This is an experimental feature and may change in future versions`,
        ),
    );

    const spinner = GlobalState.startSpinner(
        `  Generating Lightdash exposures .yml for project ${styles.bold(
            config.context.projectName || config.context.project,
        )}`,
    );
    try {
        const absoluteProjectPath = path.resolve(options.projectDir);

        const exposures = await lightdashApi<Record<string, DbtExposure>>({
            method: 'GET',
            url: `/api/v1/projects/${config.context.project}/dbt-exposures`,
            body: undefined,
        });

        console.info(
            styles.info(`Found ${Object.keys(exposures).length} exposures`),
        );

        const outputFilePath =
            options.output ||
            path.join(absoluteProjectPath, 'models', 'lightdash_exposures.yml');
        const updatedYml = {
            version: 2 as const,
            exposures: Object.values(exposures).map(
                ({ dependsOn, ...rest }) => ({
                    ...rest,
                    depends_on: dependsOn,
                }),
            ),
        };
        const ymlString = yaml.dump(updatedYml, {
            quotingType: '"',
        });
        await fs.writeFile(outputFilePath, ymlString);
        spinner.succeed(`  Generated exposures file in '${outputFilePath}'`);
        await LightdashAnalytics.track({
            event: 'generate_exposures.completed',
            properties: {
                executionId,
                countExposures: Object.keys(exposures).length,
            },
        });
    } catch (e: any) {
        await LightdashAnalytics.track({
            event: 'generate_exposures.error',
            properties: {
                executionId,
                trigger: 'generate',
                error: `${e.message}`,
            },
        });
        spinner.fail(`  Failed to generate exposures file'`);
        throw e;
    }
};
