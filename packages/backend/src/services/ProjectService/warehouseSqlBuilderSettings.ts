import {
    getColumnTimezone,
    type CreateWarehouseCredentials,
    type WarehouseTypes,
    type WeekDay,
} from '@lightdash/common';

export type WarehouseSqlBuilderSettings = {
    type: WarehouseTypes;
    startOfWeek: WeekDay | null;
    columnTimezone: string;
    dataTimezone: string | null;
};

export const toWarehouseSqlBuilderSettings = (
    credentials: CreateWarehouseCredentials,
): WarehouseSqlBuilderSettings => ({
    type: credentials.type,
    startOfWeek: credentials.startOfWeek ?? null,
    columnTimezone: getColumnTimezone(credentials),
    dataTimezone: credentials.dataTimezone ?? null,
});
