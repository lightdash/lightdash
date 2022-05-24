import { promises as fs } from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';
import { lightdashApi } from './apiClient';

export const getChart = async (
    chartId: string,
    options: any,
): Promise<void> => {
    console.log(options);
    const results = await lightdashApi({
        method: 'GET',
        url: `/api/v1/saved/${chartId}`,
        body: undefined,
    });
    if (options.output) {
        await fs.writeFile(
            path.join(process.cwd(), options.output),
            yaml.dump(results),
        );
    } else {
        console.log(results);
    }
};
