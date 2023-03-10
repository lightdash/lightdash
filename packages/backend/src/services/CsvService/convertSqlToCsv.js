/* tslint:disable */
/* eslint-disable */
const { workerData, parentPort } = require('worker_threads');

const { convertSqlToCsv } = require('./CsvService');

function formatRowsWorker() {
    convertSqlToCsv(workerData.results, workerData.customLabels).then((csv) => {
        parentPort.postMessage(csv);
    });
}

formatRowsWorker();
