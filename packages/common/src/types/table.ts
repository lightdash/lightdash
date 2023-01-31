export enum OrderFieldsByStrategy {
    LABEL = 'LABEL',
    INDEX = 'INDEX',
}

export type TableBase = {
    name: string; // Must be sql friendly (a-Z, 0-9, _)
    label: string; // Friendly name
    description?: string; // Optional description of table
    database: string;
    schema: string;
    sqlTable: string; // The sql identifier for the table
    orderFieldsBy?: OrderFieldsByStrategy;
};
