import { DashboardFilterValidationErrorType } from '@lightdash/common';
import knex from 'knex';
import { getTracker, MockClient, Tracker } from 'knex-mock-client';
import { ValidationTableName } from '../../database/entities/validation';
import { ValidationModel } from './ValidationModel';

describe('ValidationModel', () => {
    describe('tenant-scoped cleanup', () => {
        const database = knex({ client: MockClient, dialect: 'pg' });
        const model = new ValidationModel({ database });
        let tracker: Tracker;

        beforeAll(() => {
            tracker = getTracker();
        });

        afterEach(() => {
            tracker.reset();
        });

        it('deletes chart validations only in the requested project', async () => {
            const chartUuid = '11111111-1111-4111-8111-111111111111';
            const projectUuid = '22222222-2222-4222-8222-222222222222';

            tracker.on
                .delete(({ sql }) => sql.includes(ValidationTableName))
                .responseOnce(1);

            await model.deleteChartValidations(chartUuid, projectUuid);

            const [query] = tracker.history.delete;
            expect(query.bindings).toContain(chartUuid);
            expect(query.bindings).toContain(projectUuid);
        });

        it('deletes dashboard validations only in the requested project', async () => {
            const dashboardUuid = '33333333-3333-4333-8333-333333333333';
            const projectUuid = '22222222-2222-4222-8222-222222222222';

            tracker.on
                .delete(({ sql }) => sql.includes(ValidationTableName))
                .responseOnce(1);

            await model.deleteDashboardValidations(dashboardUuid, projectUuid);

            const [query] = tracker.history.delete;
            expect(query.bindings).toContain(dashboardUuid);
            expect(query.bindings).toContain(projectUuid);
        });
    });

    describe('parseDashboardFilterError', () => {
        it('Should parse "table not used by any chart" error', () => {
            const error =
                "Filter error: the field 'orders_status' references table 'orders' which is not used by any chart on this dashboard";

            const result = ValidationModel.parseDashboardFilterError(error);

            expect(result).toEqual({
                tableName: 'orders',
                dashboardFilterErrorType:
                    DashboardFilterValidationErrorType.TableNotUsedByAnyChart,
            });
        });

        it('Should parse "field no longer exists" error', () => {
            const error =
                "Filter error: the field 'orders_status' no longer exists";

            const result = ValidationModel.parseDashboardFilterError(error);

            expect(result).toEqual({
                dashboardFilterErrorType:
                    DashboardFilterValidationErrorType.FieldDoesNotExist,
            });
        });

        it('Should parse "table no longer exists" error', () => {
            const error = "Table 'orders' no longer exists";

            const result = ValidationModel.parseDashboardFilterError(error);

            expect(result).toEqual({
                tableName: 'orders',
                dashboardFilterErrorType:
                    DashboardFilterValidationErrorType.TableDoesNotExist,
            });
        });

        it('Should distinguish between "table no longer exists" and "field no longer exists"', () => {
            const tableError = "Table 'orders' no longer exists";
            const fieldError =
                "Filter error: the field 'orders_status' no longer exists";

            const tableResult =
                ValidationModel.parseDashboardFilterError(tableError);
            const fieldResult =
                ValidationModel.parseDashboardFilterError(fieldError);

            // Table error should be categorized as TableDoesNotExist
            expect(tableResult).toEqual({
                tableName: 'orders',
                dashboardFilterErrorType:
                    DashboardFilterValidationErrorType.TableDoesNotExist,
            });

            // Field error should be categorized as FieldDoesNotExist
            expect(fieldResult).toEqual({
                dashboardFilterErrorType:
                    DashboardFilterValidationErrorType.FieldDoesNotExist,
            });
        });

        it('Should return empty object for unrecognized error patterns', () => {
            const error = 'Some other error message';

            const result = ValidationModel.parseDashboardFilterError(error);

            expect(result).toEqual({});
        });

        it('Should handle errors with special characters in field names', () => {
            const error =
                "Filter error: the field 'orders_is_completed' references table 'orders' which is not used by any chart on this dashboard";

            const result = ValidationModel.parseDashboardFilterError(error);

            expect(result).toEqual({
                tableName: 'orders',
                dashboardFilterErrorType:
                    DashboardFilterValidationErrorType.TableNotUsedByAnyChart,
            });
        });

        it('Should handle errors with underscores in table names', () => {
            const error = "Table 'order_items' no longer exists";

            const result = ValidationModel.parseDashboardFilterError(error);

            expect(result).toEqual({
                tableName: 'order_items',
                dashboardFilterErrorType:
                    DashboardFilterValidationErrorType.TableDoesNotExist,
            });
        });

        it('Should parse "field no longer exists" with table name', () => {
            const error =
                "Filter error: the field 'orders_is_completed' on table 'orders' no longer exists";

            const result = ValidationModel.parseDashboardFilterError(error);

            expect(result).toEqual({
                tableName: 'orders',
                dashboardFilterErrorType:
                    DashboardFilterValidationErrorType.FieldDoesNotExist,
            });
        });

        it('Should parse "field does not match table" error (FieldTableMismatch)', () => {
            const error =
                "Filter error: the field 'orders_is_completed' does not match table 'orders_renamed'";

            const result = ValidationModel.parseDashboardFilterError(error);

            expect(result).toEqual({
                tableName: 'orders_renamed',
                dashboardFilterErrorType:
                    DashboardFilterValidationErrorType.FieldTableMismatch,
            });
        });

        it('Should parse "field no longer exists" with multi-underscore table name', () => {
            const error =
                "Filter error: the field 'order_items_quantity' on table 'order_items' no longer exists";

            const result = ValidationModel.parseDashboardFilterError(error);

            expect(result).toEqual({
                tableName: 'order_items',
                dashboardFilterErrorType:
                    DashboardFilterValidationErrorType.FieldDoesNotExist,
            });
        });
    });
});
