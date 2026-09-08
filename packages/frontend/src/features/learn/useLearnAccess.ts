import { type ApiError, type LearnAccess } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../api';
import { heldScopes } from './access';

/**
 * Everything the learner can do, anywhere: their organization role, any
 * organization-level custom roles, and every project role they hold
 * directly or through a group. A grant is a deliberate one wherever it came
 * from, so every variant it carries counts except `@self`.
 *
 * Kept apart from access.ts, which the catalogue imports: that module has to
 * load outside vite (the scope-tours checker runs it under tsx), and the
 * API client cannot.
 */
export const useLearnAccess = () => {
    const query = useQuery<LearnAccess, ApiError>({
        queryKey: ['learn_access'],
        queryFn: () =>
            lightdashApi<LearnAccess>({
                url: '/org/training-project/access',
                method: 'GET',
                body: undefined,
            }),
    });
    return {
        ...query,
        held: heldScopes(query.data?.scopes ?? [], true),
        // Until the instance answers, the library cannot say what the
        // learner holds; it waits rather than showing them an empty shelf.
        isSettled: !query.isLoading,
    };
};
