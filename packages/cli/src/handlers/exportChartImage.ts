import { promises as fs } from 'fs';
import fetch from 'node-fetch';
import { validate as isValidUuid } from 'uuid';
import { getConfig } from '../config';
import GlobalState from '../globalState';
import * as styles from '../styles';
import { lightdashApi } from './dbt/apiClient';

type ExportChartImageOptions = {
    output: string;
    project?: string;
    verbose?: boolean;
};

export const exportChartImageHandler = async (
    chartUuidOrSlug: string,
    options: ExportChartImageOptions,
): Promise<void> => {
    GlobalState.setVerbose(options.verbose ?? false);

    const spinner = GlobalState.startSpinner(
        `Exporting chart image for '${chartUuidOrSlug}'...`,
    );

    const isChartUuid = isValidUuid(chartUuidOrSlug);
    const projectUuid =
        options.project ??
        (!isChartUuid ? (await getConfig()).context?.project : undefined);
    if (!projectUuid && !isChartUuid) {
        throw new Error(
            'A project is required when exporting by slug. Pass --project <uuid> or select a project first.',
        );
    }
    const projectQuery = projectUuid
        ? `?projectUuid=${encodeURIComponent(projectUuid)}`
        : '';

    const imageUrl = await lightdashApi<string>({
        method: 'POST',
        url: `/api/v1/saved/${chartUuidOrSlug}/export${projectQuery}`,
        body: undefined,
    });

    if (!imageUrl) {
        spinner.warn('No image URL returned');
        return;
    }

    GlobalState.debug(`> Image URL: ${imageUrl}`);
    spinner.text = 'Downloading image...';

    const response = await fetch(imageUrl);
    if (!response.ok) {
        spinner.fail('Failed to download chart image');
        throw new Error(
            `Failed to download image: ${response.status} ${response.statusText}`,
        );
    }
    const arrayBuffer = await response.arrayBuffer();
    await fs.writeFile(options.output, Buffer.from(arrayBuffer));

    spinner.succeed(
        `${styles.success('Success!')} Saved chart image to ${options.output}`,
    );
};
