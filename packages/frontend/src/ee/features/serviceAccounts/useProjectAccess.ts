import {
    type ApiError,
    type ServiceAccountProjectGrant,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

// Reads the per-SA project-grants list — used by the table's hover preview and
// by the edit modal to pre-fill the project-access rows. Grants are written via
// the SA create and update payloads, not a dedicated grants endpoint.
const SA_GRANTS_KEY = 'service-account-project-grants';

const fetchGrantsForServiceAccount = (serviceAccountUuid: string) =>
    lightdashApi<ServiceAccountProjectGrant[]>({
        method: 'GET',
        url: `/service-accounts/${serviceAccountUuid}/projects`,
    });

export const useServiceAccountProjectGrants = (serviceAccountUuid: string) =>
    useQuery<ServiceAccountProjectGrant[], ApiError>({
        queryKey: [SA_GRANTS_KEY, serviceAccountUuid],
        queryFn: () => fetchGrantsForServiceAccount(serviceAccountUuid),
        enabled: !!serviceAccountUuid,
    });
