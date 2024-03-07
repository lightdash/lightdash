import { type ApiSqlQueryResults } from '@lightdash/common';
import { parentPort, workerData } from 'worker_threads';
import { convertSqlToCsv } from './CsvService';

type Args = {
    results: ApiSqlQueryResults;
    customLabels: Record<string, string> | undefined;
};

function run() {
    const { results, customLabels }: Args = workerData;

    convertSqlToCsv(results, customLabels).then((csv) => {
        if (parentPort) parentPort.postMessage(csv);
    });
}

run();
