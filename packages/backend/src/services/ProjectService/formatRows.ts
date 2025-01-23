import {
    Field,
    formatRows,
    ItemsMap,
    TableCalculation,
} from '@lightdash/common';
import { parentPort, workerData } from 'worker_threads';

type Args = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rows: Record<string, any>[];
    itemMap: ItemsMap;
};

function run() {
    const { rows, itemMap }: Args = workerData;
    const formattedRows = formatRows(rows, itemMap);
    if (parentPort) parentPort.postMessage(formattedRows);
}

run();
