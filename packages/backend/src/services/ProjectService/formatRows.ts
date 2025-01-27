import { AnyType, formatRows, ItemsMap } from '@lightdash/common';
import { parentPort, workerData } from 'worker_threads';

type Args = {
    rows: Record<string, AnyType>[];
    itemMap: ItemsMap;
};

function run() {
    const { rows, itemMap }: Args = workerData;
    const formattedRows = formatRows(rows, itemMap);
    if (parentPort) parentPort.postMessage(formattedRows);
}

run();
