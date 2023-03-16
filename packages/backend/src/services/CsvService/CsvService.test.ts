import * as fs from 'fs/promises';
import { dashboardModel, savedChartModel } from '../../models/models';
import { projectService, s3Service } from '../services';
import { CsvService } from './CsvService';
import { itemMap, metricQuery } from './CsvService.mock';

jest.mock('../../models/models', () => ({
    savedChartModel: {},
    dashboardModel: {},
}));

jest.mock('../services', () => ({
    s3Service: {},
    projectService: {},
}));

describe('Csv service', () => {
    const csvService = new CsvService({
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
        const fileId = await CsvService.convertRowsToCsv(
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
        const fileId = await CsvService.convertRowsToCsv(
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
});
