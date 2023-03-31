import * as fs from 'fs/promises';
import {
    dashboardModel,
    savedChartModel,
    userModel,
} from '../../models/models';
import { projectService, s3Service } from '../services';
import { CsvService } from './CsvService';
import { itemMap, metricQuery } from './CsvService.mock';

jest.mock('../../clients/clients', () => ({
    schedulerClient: {},
}));

jest.mock('../../models/models', () => ({
    savedChartModel: {},
    dashboardModel: {},
    userModel: {},
}));

jest.mock('../services', () => ({
    s3Service: {},
    projectService: {},
}));

describe('Csv service', () => {
    const csvService = new CsvService({
        userModel,
        projectService,
        s3Service,
        savedChartModel,
        dashboardModel,
    });

    it('Should convert rows to CSV with format', async () => {
        const rows = [...Array(5).keys()].map((i) => ({
            column_number: i,
            column_string: `value_${i}`,
            column_date: '2020-03-16T11:32:55.000Z',
        }));
        const fileId = await CsvService.writeRowsToFile(
            rows,
            false,
            metricQuery,
            itemMap,
            false,
            {},
            [],
        );

        const csvContent = await fs.readFile(`/tmp/${fileId}`, {
            encoding: 'utf-8',
        });

        expect(csvContent).toEqual(
            `column number,column string,column date
$0.00,value_0,2020-03-16
$1.00,value_1,2020-03-16
$2.00,value_2,2020-03-16
$3.00,value_3,2020-03-16
$4.00,value_4,2020-03-16
`,
        );
    });

    it('Should convert rows to RAW CSV with table names', async () => {
        const rows = [...Array(5).keys()].map((i) => ({
            column_number: i,
            column_string: `value_${i}`,
            column_date: '2020-03-16T11:32:55.000Z',
        }));
        const fileId = await CsvService.writeRowsToFile(
            rows,
            true,
            metricQuery,
            itemMap,
            true,
            {},
            [],
        );

        const csvContent = await fs.readFile(`/tmp/${fileId}`, {
            encoding: 'utf-8',
        });

        expect(csvContent).toEqual(
            `table column number,column string,table column date
0,value_0,2020-03-16
1,value_1,2020-03-16
2,value_2,2020-03-16
3,value_3,2020-03-16
4,value_4,2020-03-16
`,
        );
    });

    it('Should convert rows to csv', async () => {
        const row = {
            column_number: 1,
            column_string: `value_1`,
            column_date: '2020-03-16T11:32:55.000Z',
        };

        const csv = CsvService.convertRowToCsv(row, itemMap, false, [
            'column_number',
            'column_string',
            'column_date',
        ]);

        expect(csv).toEqual(['$1.00', 'value_1', '2020-03-16']);
    });
    it('Should convert RAW rows to csv', async () => {
        const row = {
            column_number: 1,
            column_string: `value_1`,
            column_date: '2020-03-16T11:32:55.000Z',
        };

        const csv = CsvService.convertRowToCsv(row, itemMap, true, [
            'column_number',
            'column_string',
            'column_date',
        ]);

        expect(csv).toEqual([1, 'value_1', '2020-03-16']);
    });
});
