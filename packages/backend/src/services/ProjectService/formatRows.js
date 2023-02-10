/* tslint:disable */
/* eslint-disable */
const { workerData, parentPort } = require("worker_threads");

const { formatItemValue } = require("@lightdash/common");

function formatRows(
    rows,
    itemMap,
) {
    const formattedRows =  rows.map((row) =>
        Object.keys(row).reduce((acc, columnName) => {
            const col = row[columnName];

            const item = itemMap[columnName];
            return {
                ...acc,
                [columnName]: {
                    value: {
                        raw: col,
                        formatted: formatItemValue(item, col),
                    },
                },
            };
        }, {}),
    );

    parentPort.postMessage(formattedRows);
}

formatRows(workerData.rows, workerData.itemMap);
