import {
    DEFAULT_SPOTLIGHT_CONFIG,
    loadLightdashProjectConfig,
    loadProjectContextFile,
} from '@lightdash/common';
import fs from 'fs/promises';
import path from 'path';
import { LightdashAnalytics } from '../analytics/analytics';
import { getConfig } from '../config';
import { getAgentConnectionSelection } from '../credentials';
import GlobalState from '../globalState';

export const readAndLoadLightdashProjectConfig = async (
    projectDir: string,
    projectUuid?: string,
) => {
    const { user, context } = await (getAgentConnectionSelection() === null
        ? getConfig()
        : getConfig({ readOnly: true }));
    const configPath = path.join(projectDir, 'lightdash.config.yml');
    try {
        const fileContents = await fs.readFile(configPath, 'utf8');
        const config = await loadLightdashProjectConfig(
            fileContents,
            async (lightdashConfig) => {
                void LightdashAnalytics.track({
                    event: 'lightdashconfig.loaded',
                    properties: {
                        projectId: projectUuid ?? context?.project ?? '',
                        userId: user?.userUuid,
                        organizationId: user?.organizationUuid,
                        categories_count: Number(
                            Object.keys(
                                lightdashConfig.spotlight.categories ?? {},
                            ).length,
                        ),
                        default_visibility:
                            lightdashConfig.spotlight.default_visibility,
                    },
                });
            },
        );
        return config;
    } catch (e) {
        GlobalState.debug(`No lightdash.config.yml found in ${configPath}`);

        if (e instanceof Error && 'code' in e && e.code === 'ENOENT') {
            // Return default config if file doesn't exist
            return {
                spotlight: DEFAULT_SPOTLIGHT_CONFIG,
            };
        }
        throw e;
    }
};

// Returns the raw file so the server parses it with the same loader; parsing
// here only fails fast on an invalid file before anything is deployed.
export const readProjectContextFile = async (
    projectDir: string,
): Promise<string | undefined> => {
    const filePath = path.join(projectDir, 'lightdash.project_context.yml');
    let fileContents: string;
    try {
        fileContents = await fs.readFile(filePath, 'utf8');
    } catch (e) {
        if (e instanceof Error && 'code' in e && e.code === 'ENOENT') {
            GlobalState.debug(
                `No lightdash.project_context.yml found in ${filePath}`,
            );
            return undefined;
        }
        throw e;
    }
    loadProjectContextFile(fileContents);
    return fileContents;
};
