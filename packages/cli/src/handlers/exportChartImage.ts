import { promises as fs } from 'fs';
import fetch from 'node-fetch';
import GlobalState from '../globalState';
import * as styles from '../styles';
import { lightdashApi } from './dbt/apiClient';

type ExportChartImageOptions = {
    output: string;
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

    const imageUrl = await lightdashApi<string>({
        method: 'POST',
        url: `/api/v1/saved/${chartUuidOrSlug}/export`,
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
