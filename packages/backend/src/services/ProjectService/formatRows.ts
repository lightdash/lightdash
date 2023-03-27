import { Field, formatRows, TableCalculation } from '@lightdash/common';
import { parentPort, workerData } from 'worker_threads';

type Args = {
    rows: Record<string, any>[];
    itemMap: Record<string, Field | TableCalculation>;
};

function run() {
    const { rows, itemMap }: Args = workerData;
    const formattedRows = formatRows(rows, itemMap);
    if (parentPort) parentPort.postMessage(formattedRows);
}

run();
