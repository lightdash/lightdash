import { DashboardFilterValidationErrorType } from '@lightdash/common';
import { ValidationModel } from './ValidationModel';

describe('ValidationModel', () => {
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
    });
});
