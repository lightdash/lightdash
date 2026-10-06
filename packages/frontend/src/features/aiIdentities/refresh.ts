import { type QueryClient } from '@tanstack/react-query';

export const refreshAiIdentityCounts = (queryClient: QueryClient) =>
    Promise.all([
        queryClient.invalidateQueries(['ai-identity-accounts']),
        queryClient.invalidateQueries(['ai-identity-list']),
    ]);
