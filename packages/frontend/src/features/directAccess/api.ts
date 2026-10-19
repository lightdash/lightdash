import {
    type ApiSuccessEmpty,
    type ApiDirectAccessGroupsResponse,
    type ApiDirectAccessUsersResponse,
    type DirectAccessAssignment,
    type DirectAccessPrincipalType,
    type DirectAccessResourceType,
    type SpaceMemberRole,
} from '@lightdash/common';
import { type LightdashApi } from '../../api';

/**
 * Closed reference to a resource that can carry direct access grants. The
 * same shape addresses every supported type — no per-resource clients.
 */
export type DirectAccessResourceRef = {
    resourceType: DirectAccessResourceType;
    resourceUuid: string;
};

const assignmentsPath = (projectUuid: string, ref: DirectAccessResourceRef) =>
    `/projects/${projectUuid}/direct-access/${ref.resourceType}/${ref.resourceUuid}/assignments`;

export const getDirectAccessGroups = (
    lightdashApi: LightdashApi,
    projectUuid: string,
    ref: DirectAccessResourceRef,
) =>
    lightdashApi<ApiDirectAccessGroupsResponse['results']>({
        version: 'v2',
        url: `/projects/${projectUuid}/direct-access/${ref.resourceType}/${ref.resourceUuid}/groups`,
        method: 'GET',
        body: undefined,
    });

export const getDirectAccessUsers = (
    lightdashApi: LightdashApi,
    projectUuid: string,
    ref: DirectAccessResourceRef,
) =>
    lightdashApi<ApiDirectAccessUsersResponse['results']>({
        version: 'v2',
        url: `/projects/${projectUuid}/direct-access/${ref.resourceType}/${ref.resourceUuid}/users`,
        method: 'GET',
        body: undefined,
    });

export const getDirectAccessAssignments = (
    lightdashApi: LightdashApi,
    projectUuid: string,
    ref: DirectAccessResourceRef,
) =>
    lightdashApi<DirectAccessAssignment[]>({
        version: 'v2',
        url: assignmentsPath(projectUuid, ref),
        method: 'GET',
        body: undefined,
    });

export const upsertDirectAccessAssignment = (
    lightdashApi: LightdashApi,
    projectUuid: string,
    ref: DirectAccessResourceRef,
    principalType: DirectAccessPrincipalType,
    principalUuid: string,
    role: SpaceMemberRole,
) =>
    lightdashApi<ApiSuccessEmpty['results']>({
        version: 'v2',
        url: `${assignmentsPath(
            projectUuid,
            ref,
        )}/${principalType}/${principalUuid}`,
        method: 'PUT',
        body: JSON.stringify({ role }),
    });

export const revokeDirectAccessAssignment = (
    lightdashApi: LightdashApi,
    projectUuid: string,
    ref: DirectAccessResourceRef,
    principalType: DirectAccessPrincipalType,
    principalUuid: string,
) =>
    lightdashApi<ApiSuccessEmpty['results']>({
        version: 'v2',
        url: `${assignmentsPath(
            projectUuid,
            ref,
        )}/${principalType}/${principalUuid}`,
        method: 'DELETE',
        body: undefined,
    });

export const resetDirectAccess = (
    lightdashApi: LightdashApi,
    projectUuid: string,
    ref: DirectAccessResourceRef,
) =>
    lightdashApi<ApiSuccessEmpty['results']>({
        version: 'v2',
        url: assignmentsPath(projectUuid, ref),
        method: 'DELETE',
        body: undefined,
    });
