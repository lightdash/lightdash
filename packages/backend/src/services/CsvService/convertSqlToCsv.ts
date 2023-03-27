import { ApiSqlQueryResults } from '@lightdash/common';
import { parentPort, workerData } from 'worker_threads';
import { convertSqlToCsv } from './CsvService';

function formatRowsWorker() {
    const { results } = workerData;
    const { customLabels } = workerData;

    convertSqlToCsv(results, customLabels).then((csv) => {
        if (parentPort) parentPort.postMessage(csv);
    });
}

formatRowsWorker();
