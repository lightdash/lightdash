/* tslint:disable */
/* eslint-disable */
const { workerData, parentPort } = require('worker_threads');

const { formatRows } = require('@lightdash/common');

function formatRowsWorker() {

    const formattedRows = formatRows(workerData.rows, workerData.itemMap)
    parentPort.postMessage(formattedRows);
}

formatRowsWorker();
