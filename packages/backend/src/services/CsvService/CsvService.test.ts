import * as fs from 'fs/promises';
import moment from 'moment';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { S3Client } from '../../clients/Aws/s3';
import { S3CacheClient } from '../../clients/Aws/S3CacheClient';
import EmailClient from '../../clients/EmailClient/EmailClient';
import { lightdashConfig } from '../../config/lightdashConfig';
import { AnalyticsModel } from '../../models/AnalyticsModel';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { DownloadFileModel } from '../../models/DownloadFileModel';
import { EmailModel } from '../../models/EmailModel';
import { JobModel } from '../../models/JobModel/JobModel';
import { OnboardingModel } from '../../models/OnboardingModel/OnboardingModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SpaceModel } from '../../models/SpaceModel';
import { SshKeyPairModel } from '../../models/SshKeyPairModel';
import { UserAttributesModel } from '../../models/UserAttributesModel';
import { UserModel } from '../../models/UserModel';
import { UserWarehouseCredentialsModel } from '../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import { WarehouseAvailableTablesModel } from '../../models/WarehouseAvailableTablesModel/WarehouseAvailableTablesModel';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import { ProjectService } from '../ProjectService/ProjectService';
import { CsvService } from './CsvService';
import { itemMap, metricQuery } from './CsvService.mock';

describe('Csv service', () => {
    const csvService = new CsvService({
        lightdashConfig,
        analytics: analyticsMock,
        userModel: {} as UserModel,
        projectService: new ProjectService({
            lightdashConfig,
            analytics: analyticsMock,
            analyticsModel: {} as AnalyticsModel,
            dashboardModel: {} as DashboardModel,
            emailClient: {} as EmailClient,
            jobModel: {} as JobModel,
            onboardingModel: {} as OnboardingModel,
            projectModel: {} as ProjectModel,
            s3CacheClient: {} as S3CacheClient,
            savedChartModel: {} as SavedChartModel,
            spaceModel: {} as SpaceModel,
            sshKeyPairModel: {} as SshKeyPairModel,
            userAttributesModel: {} as UserAttributesModel,
            userWarehouseCredentialsModel: {} as UserWarehouseCredentialsModel,
            warehouseAvailableTablesModel: {} as WarehouseAvailableTablesModel,
            emailModel: {
                getPrimaryEmailStatus: (userUuid: string) => ({
                    isVerified: true,
                }),
            } as unknown as EmailModel,
            schedulerClient: {} as SchedulerClient,
            downloadFileModel: {} as DownloadFileModel,
            s3Client: {} as S3Client,
        }),
        s3Client: {} as S3Client,
        savedChartModel: {} as SavedChartModel,
        dashboardModel: {} as DashboardModel,
        downloadFileModel: {} as DownloadFileModel,
        schedulerClient: {} as SchedulerClient,
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
            'explore',
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
            'explore',
            false,
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

    it('Should convert with row with null date', async () => {
        const row = {
            column_number: 1,
            column_string: `value_1`,
            column_date: null,
        };

        const csv = CsvService.convertRowToCsv(row, itemMap, false, [
            'column_number',
            'column_string',
            'column_date',
        ]);

        expect(csv).toEqual(['$1.00', 'value_1', null]);
    });

    it('Should convert with row with undefined value', async () => {
        const row = {
            column_number: undefined,
            column_string: `value_1`,
            column_date: '2020-03-16T11:32:55.000Z',
        };

        const csv = CsvService.convertRowToCsv(row, itemMap, false, [
            'column_number',
            'column_string',
            'column_date',
        ]);

        expect(csv).toEqual([undefined, 'value_1', '2020-03-16']);
    });

    it('Should generate csv file ids', async () => {
        const time = moment('2023-09-07 12:13:45.123');
        const timestamp = time.format('YYYY-MM-DD-HH-mm-ss-SSSS');

        expect(timestamp).toEqual(`2023-09-07-12-13-45-1230`);

        expect(CsvService.generateFileId('payment', false, time)).toEqual(
            `csv-payment-${timestamp}.csv`,
        );
        expect(CsvService.generateFileId('MyTable', false, time)).toEqual(
            `csv-mytable-${timestamp}.csv`,
        );
        expect(CsvService.generateFileId('my table', false, time)).toEqual(
            `csv-my_table-${timestamp}.csv`,
        );
        expect(CsvService.generateFileId('table!', false, time)).toEqual(
            `csv-table_-${timestamp}.csv`,
        );
        expect(
            CsvService.generateFileId('this is a chart title', false, time),
        ).toEqual(`csv-this_is_a_chart_title-${timestamp}.csv`);
        expect(
            CsvService.generateFileId(
                'another table (for testing)',
                false,
                time,
            ),
        ).toEqual(`csv-another_table_for_testing_-${timestamp}.csv`);
        expect(
            CsvService.generateFileId('weird chars *!"()_-', false, time),
        ).toEqual(`csv-weird_chars_-${timestamp}.csv`);

        // Test without time
        expect(CsvService.generateFileId('payment')).toContain(`csv-payment-`);
    });

    it('Should generate csv file for incomplete file', async () => {
        const time = moment('2023-09-07 12:13:45.123');
        const timestamp = time.format('YYYY-MM-DD-HH-mm-ss-SSSS');

        expect(CsvService.generateFileId('payment', true, time)).toEqual(
            `csv-incomplete_results-payment-${timestamp}.csv`,
        );
        // Test without time
        expect(CsvService.generateFileId('payment', true)).toContain(
            `csv-incomplete_results-payment-`,
        );
    });

    it('isValidCsvFileId', async () => {
        const time = moment('2023-09-07 12:13:45.123');
        const timestamp = time.format('YYYY-MM-DD-HH-mm-ss-SSSS');

        const validNames = [
            `csv-payment-${timestamp}.csv`,
            `csv-mytable-${timestamp}.csv`,
            `csv-my_table-${timestamp}.csv`,
            `csv-table_-${timestamp}.csv`,
            `csv-this_is_a_chart_title-${timestamp}.csv`,
            `csv-another_table_for_testing_-${timestamp}.csv`,
            `csv-weird_chars_-${timestamp}.csv`,
            `csv-incomplete_results-payment-${timestamp}.csv`,
        ];

        const invalidNames = [
            `without_prefix-${timestamp}.csv`,
            `csv-without_suffix-${timestamp}`,
            `csv-no_timestamp.csv`,
            `csv-with space-${timestamp}.csv`,
            `csv-UPPERCASED-${timestamp}.csv`,
        ];
        validNames.forEach((name) => {
            expect(name + CsvService.isValidCsvFileId(name)).toEqual(
                name + true,
            );
        });
        invalidNames.forEach((name) => {
            expect(name + CsvService.isValidCsvFileId(name)).toEqual(
                name + false,
            );
        });
    });
});
