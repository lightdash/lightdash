import {
    AuthorizationError,
    DbtExposure,
    DbtVersionOptionLatest,
    getErrorMessage,
    isDbtVersion110OrHigher,
} from '@lightdash/common';
import { promises as fs } from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { LightdashAnalytics } from '../analytics/analytics';
import { getConfig } from '../config';
import GlobalState from '../globalState';
import * as styles from '../styles';
import { checkLightdashVersion, lightdashApi } from './dbt/apiClient';
import { getDbtVersion } from './dbt/getDbtVersion';

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

        // Detect dbt version to determine format
        const dbtVersionInfo = await getDbtVersion();
        const isDbt110Plus =
            dbtVersionInfo.versionOption === DbtVersionOptionLatest.LATEST
                ? true
                : isDbtVersion110OrHigher(dbtVersionInfo.versionOption);

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

        // Transform exposures based on dbt version
        const transformedExposures = Object.values(exposures).map(
            ({ dependsOn, tags, ...rest }) => {
                if (isDbt110Plus && tags) {
                    // For dbt 1.10+, move tags under config
                    return {
                        ...rest,
                        depends_on: dependsOn,
                        config: {
                            tags,
                        },
                    };
                }
                // For older versions, keep tags at top level
                return {
                    ...rest,
                    depends_on: dependsOn,
                    ...(tags ? { tags } : {}),
                };
            },
        );

        const updatedYml = {
            version: 2 as const,
            exposures: transformedExposures,
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
    } catch (e: unknown) {
        await LightdashAnalytics.track({
            event: 'generate_exposures.error',
            properties: {
                executionId,
                trigger: 'generate',
                error: `${getErrorMessage(e)}`,
            },
        });
        spinner.fail(`  Failed to generate exposures file'`);
        throw e;
    }
};
