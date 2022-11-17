import { SavedChart } from '@lightdash/common';
import { promises as fs } from 'fs';
import * as yaml from 'js-yaml';
import { URL } from 'url';
import { lightdashApi } from './dbt/apiClient';

type Options = {
    file: string;
};
export const updateResource = async (options: Options) => {
    const { file } = options;
    const data = yaml.load(await fs.readFile(file, 'utf8')) as SavedChart;
    const url = `/api/v1/saved/${data.uuid}`;
    await lightdashApi({
        method: 'PUT',
        url,
        body: JSON.stringify(data),
    });
    const fullUrl = new URL(
        `/projects/${data.projectUuid}/saved/${data.uuid}`,
        'http://localhost:3000',
    ).href;
    console.log(`⚡️ ${fullUrl}`);
};
