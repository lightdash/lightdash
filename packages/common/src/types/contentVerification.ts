import { type ContentType } from './content';

export type ContentVerificationInfo = {
    verifiedBy: {
        userUuid: string;
        firstName: string;
        lastName: string;
    };
    verifiedAt: Date;
};

export type VerifiedContentListItem = {
    uuid: string;
    contentType: ContentType;
    contentUuid: string;
    name: string;
    spaceUuid: string;
    spaceName: string;
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

export type ApiVerifiedContentListResponse = {
    status: 'ok';
    results: VerifiedContentListItem[];
};

export { ContentType as ContentVerificationType };
