import { formatRows } from '@lightdash/common';
import { parentPort, workerData } from 'worker_threads';

function formatRowsWorker() {
    const formattedRows = formatRows(workerData.rows, workerData.itemMap);
    if (parentPort) parentPort.postMessage(formattedRows);
}

formatRowsWorker();
