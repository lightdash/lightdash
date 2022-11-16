import {
    chartsV1ResourceFromApi,
    chartV1ResourceIdFromUrl,
    SavedChart,
} from '@lightdash/common';
import * as yaml from 'js-yaml';
import { promises as fs } from 'fs';
import { adjectives, uniqueNamesGenerator } from 'unique-names-generator';
import path from 'path';
import { lightdashApi } from './dbt/apiClient';

export const importHandler = async (url: string) => {
    const uuid = chartV1ResourceIdFromUrl(url);
    const chart = await lightdashApi<SavedChart>({
        method: 'GET',
        body: undefined,
        url: `/api/v1/saved/${uuid}`,
    });
    const resource = chartsV1ResourceFromApi(chart);
    const adjective = uniqueNamesGenerator({
        length: 1,
        dictionaries: [adjectives],
    });
    const projectRoot = process.cwd(); // TODO: actually figure out the project root
    const expectedSpaceMetadata = path.join(
        projectRoot,
        'spaces',
        chart.spaceName,
        '.space.yaml',
    );
    try {
        await fs.readFile(expectedSpaceMetadata);
    } catch (e) {
        await fs.mkdir(path.dirname(expectedSpaceMetadata), {
            recursive: true,
        });
        await fs.writeFile(
            expectedSpaceMetadata,
            yaml.dump({ spaceUuid: chart.spaceUuid }),
        );
    }
    const filename = `${adjective}-chart.yaml`;
    const filepath = path.join(path.dirname(expectedSpaceMetadata), filename);
    await fs.writeFile(filepath, yaml.dump(resource));
};

// const deployChart = async (resource: ChartsV1Resource) => {
//     const config = await getConfig();
//
//     if (resource.uuid === undefined) {
//         // create a new resource
//         const;
//     }
// };
