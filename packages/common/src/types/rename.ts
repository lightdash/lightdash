import { type RequestMethod } from './api';
import { type TraceTaskBase } from './scheduler';

export enum RenameType {
    MODEL = 'model', // eg: payment
    FIELD = 'field', // eg: id
}
/**
 *  from: string, // Field id or table prefix to be replaced (eg: payment_customer_id) 
    fromReference: string,  // Reference used in SQL strings (eg: payment.customer_id)
    to: string, // New field id or table prefix
    toReference: string, // New reference used in SQL strings
 */
export type NameChanges = {
    from: string;
    to: string;
    fromReference: string;
    toReference: string;
    fromFieldName: string | undefined;
    toFieldName: string | undefined;
};

export type ApiRenameBody = NameChanges & {
    type: RenameType;
    test?: boolean;
    model?: string;
};

export type ApiRenameChartBody = {
    from: string;
    to: string;
    type: RenameType;
    chartUuid: string;
    fixAll?: boolean;
};
export type ApiRenameResponse = {
    status: 'ok';
    results: {
        charts: string[];
        dashboards: string[];
        alerts: string[];
        dashboardSchedulers: string[];
    };
};

export type RenameResourcesPayload = TraceTaskBase &
    ApiRenameBody & {
        context: RequestMethod;
    };
