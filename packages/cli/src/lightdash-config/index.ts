import {
    DEFAULT_SPOTLIGHT_CONFIG,
    loadLightdashProjectConfig,
} from '@lightdash/common';
import fs from 'fs/promises';
import path from 'path';
import { LightdashAnalytics } from '../analytics/analytics';
import { getConfig } from '../config';
import GlobalState from '../globalState';

export const readAndLoadLightdashProjectConfig = async (
    projectDir: string,
    projectUuid?: string,
) => {
    const { user, context } = await getConfig();
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
