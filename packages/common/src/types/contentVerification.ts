import { type ContentType } from './content';

export type ContentVerificationInfo = {
    verifiedBy: {
        userUuid: string;
        firstName: string;
        lastName: string;
    };
    verifiedAt: Date;
};

export type ApiContentVerificationResponse = {
    status: 'ok';
    results: ContentVerificationInfo;
};

export type ApiContentVerificationDeleteResponse = {
    status: 'ok';
    results: undefined;
};

export { ContentType as ContentVerificationType };
