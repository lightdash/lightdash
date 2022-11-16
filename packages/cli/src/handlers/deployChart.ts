import {
    AuthorizationError,
    ChartsV1Resource,
    chartsV1ResourceToNewVersionApi,
    chartsV1ResourceToPatchApi,
    chartsV1ResourceToPostApi,
} from '@lightdash/common';
import { getConfig } from '../config';
import { lightdashApi } from './dbt/apiClient';

const deployChart = async (resource: ChartsV1Resource) => {
    const config = await getConfig();
    const projectUuid = config.context?.project;
    if (projectUuid === undefined) {
        throw new AuthorizationError(
            `No active Lightdash project. Run 'lightdash login --help'`,
        );
    }

    // Create a new chart
    if (resource.uuid === undefined) {
        await lightdashApi({
            method: 'POST',
            url: `/projects/${projectUuid}/saved`,
            body: JSON.stringify(chartsV1ResourceToPostApi(resource)),
        });
    }

    // Update an existing chart (ideally this is just a PUT)
    else {
        await lightdashApi({
            method: 'PATCH',
            url: `/saved/${resource.uuid}`,
            body: JSON.stringify(chartsV1ResourceToPatchApi(resource)),
        });
        await lightdashApi({
            method: 'POST',
            url: `/saved/${resource.uuid}/versions`,
            body: JSON.stringify(chartsV1ResourceToNewVersionApi(resource)),
        });
    }
};
