/* tslint:disable */
/* eslint-disable */
const { workerData, parentPort } = require('worker_threads');

const moment = require('moment');
const {
    DimensionType,
    formatItemValue,
    isField
} = require('@lightdash/common');
/**
 * Workerdata fields:
 * - rows: Record<string, any>[]
 * - onlyRaw: boolean
 * - itemMap: Record<string, Item>
 * - sortedFieldIds: string[]
 * */

function formatRowsWorker() {


    parentPort.postMessage(
        workerData.rows.map((row) => {
        return workerData.sortedFieldIds.map((id) => {
            const data = row[id];
            const item = workerData.itemMap[id];

            const itemIsField = isField(item);
            if (itemIsField && item.type === DimensionType.TIMESTAMP) {
                return moment(data).format('YYYY-MM-DD HH:mm:ss');
            }
            if (itemIsField && item.type === DimensionType.DATE) {
                return moment(data).format('YYYY-MM-DD');
            }
            if (workerData.onlyRaw) return data;
            return formatItemValue(item, data);
        })
    }))
}

formatRowsWorker();