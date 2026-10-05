import {
    type AiIdentity,
    type AiIdentityAccount,
    type AiIdentityBulkTestRequest,
    type AiIdentityDetail,
    type AiIdentityEvent,
    type AiIdentityExportRequest,
    type AiIdentityJob,
    type AiIdentityListResult,
    type ApiResponse,
} from '@lightdash/common';
import { lightdashApi } from '../../api';

const root = '/org/ai-identities';

const get = <T extends ApiResponse['results']>(url: string) =>
    lightdashApi<T>({ url: `${root}${url}`, method: 'GET', version: 'v2' });

const post = <T extends ApiResponse['results']>(url: string, body?: object) =>
    lightdashApi<T>({
        url: `${root}${url}`,
        method: 'POST',
        body: JSON.stringify(body ?? {}),
        version: 'v2',
    });

const patch = <T extends ApiResponse['results']>(url: string, body: object) =>
    lightdashApi<T>({
        url: `${root}${url}`,
        method: 'PATCH',
        body: JSON.stringify(body),
        version: 'v2',
    });

export const aiIdentityApi = {
    accounts: () => get<AiIdentityAccount[]>('/accounts'),
    preview: (accountUuid: string) =>
        get<AiIdentity[]>(`/accounts/${accountUuid}/preview`),
    list: (params: URLSearchParams) =>
        get<AiIdentityListResult>(`?${params.toString()}`),
    detail: (uuid: string, includeReads = false) =>
        get<AiIdentityDetail>(`/${uuid}?includeReads=${includeReads}`),
    requestLog: (page: number, includeReads = false) =>
        get<{
            data: AiIdentityEvent[];
            pagination: AiIdentityListResult['pagination'];
        }>(
            `/request-log?page=${page}&pageSize=50&includeReads=${includeReads}`,
        ),
    job: (uuid: string) => get<AiIdentityJob>(`/jobs/${uuid}`),
    bulkTest: (body: AiIdentityBulkTestRequest) =>
        post<AiIdentityJob>('/bulk-test', body),
    export: (body: AiIdentityExportRequest) =>
        post<AiIdentityJob>('/export', body),
    test: (uuid: string) => post<AiIdentity>(`/${uuid}/test`),
    regenerateKey: (uuid: string) =>
        post<AiIdentity>(`/${uuid}/regenerate-key`),
    updateIdentity: (uuid: string, twinNameOverride: string | null) =>
        patch<AiIdentity>(`/${uuid}`, { twinNameOverride }),
    updateAccount: (
        uuid: string,
        twinNameTemplate: string | null,
        roleTemplate: string | null,
    ) =>
        patch<AiIdentityAccount>(`/accounts/${uuid}`, {
            twinNameTemplate,
            roleTemplate,
        }),
};
