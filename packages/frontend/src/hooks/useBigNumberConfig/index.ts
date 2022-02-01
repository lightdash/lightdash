import { ApiQueryResults, friendlyName } from 'common';

const useBigNumberConfig = (data: ApiQueryResults | undefined) => {
    if (data) {
        const metric: string = data.metricQuery.metrics[0];
        const bigNumberLabel: string = friendlyName(
            metric.split('_').slice(1).join('_'),
        );
        const bigNumber: number | string = data.rows[0][metric];
        return { bigNumber, bigNumberLabel };
    }
    return { bigNumber: '', bigNumberLabel: '' };
};

export default useBigNumberConfig;
