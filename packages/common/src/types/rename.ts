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

export type ApiRenameBody = {
    to: string;
    from: string;
    type: RenameType;
    dryRun?: boolean;
    model?: string;
};

export type ApiRenameChartBody = {
    from: string;
    to: string;
    type: RenameType;
    fixAll?: boolean;
};

export type RenameChange = {
    uuid: string;
    name: string;
};
export type ApiRenameResponse = {
    status: 'ok';
    results: {
        charts: RenameChange[];
        dashboards: RenameChange[];
        alerts: RenameChange[];
        dashboardSchedulers: RenameChange[];
    };
};

export type ApiRenameChartResponse = {
    status: 'ok';
    results: {
        jobId: string | undefined;
    };
};
export type ApiRenameFieldsResponse = {
    status: 'ok';
    results: {
        fields: {
            [x: string]: string[];
        };
    };
};

export type RenameResourcesPayload = TraceTaskBase &
    ApiRenameBody & {
        fromReference?: string; // When scheduler is called from UI, these are set
        toReference?: string;
        fromFieldName?: string;
        toFieldName?: string;
        context: RequestMethod;
    };
