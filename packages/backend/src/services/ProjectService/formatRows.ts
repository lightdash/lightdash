import { AnyType, formatRows, ItemsMap } from '@lightdash/common';
import { parentPort, workerData } from 'worker_threads';

type Args = {
    rows: Record<string, AnyType>[];
    itemMap: ItemsMap;
    timezone?: string;
};

function run() {
    const { rows, itemMap, timezone }: Args = workerData;
    const formattedRows = formatRows(
        rows,
        itemMap,
        undefined,
        undefined,
        timezone,
    );
    if (parentPort) parentPort.postMessage(formattedRows);
}

run();
