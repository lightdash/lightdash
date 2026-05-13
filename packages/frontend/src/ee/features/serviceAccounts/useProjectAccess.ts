import {
    type ApiError,
    type ServiceAccountProjectGrant,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

// SAs are immutable after creation, so the only client-side need is reading
// the per-SA grants list (for the table's hover preview). Mutation hooks
// have been intentionally removed along with the underlying backend
// endpoints — grants are set once via the SA create payload.
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
