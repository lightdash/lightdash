import { ApiSqlQueryResults } from '@lightdash/common';
import { parentPort, workerData } from 'worker_threads';
import { convertSqlToCsv } from './CsvService';

type Args = {
    results: ApiSqlQueryResults;
    customLabels: Record<string, string> | undefined;
};

(async () => {
    const { results, customLabels }: Args = workerData;

    const csv = await convertSqlToCsv(results, customLabels);
    if (parentPort) parentPort.postMessage(csv);
})();
