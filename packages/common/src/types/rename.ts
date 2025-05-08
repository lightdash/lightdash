import { type RequestMethod } from './api';
import { type TraceTaskBase } from './scheduler';

export enum RenameType {
    MODEL = 'model', // eg: payment
    FIELD = 'field', // eg: id
    FIELD_ID = 'field_id', // eg: payment_id (used in the UI)
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
};

export type ApiRenameBody = {
    type: RenameType;
    from: string;
    to: string;
    test?: boolean;
    model?: string;
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
