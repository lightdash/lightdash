import { ApiQueryResults } from 'common';

const bigNumberConfig = (data: ApiQueryResults | undefined) => {
    if (data) {
        const metric: string = data.metricQuery.metrics[0];
        const bigNumber: number | string = data.rows[0][metric];
        return bigNumber;
    }
    return '';
};

export default bigNumberConfig;
