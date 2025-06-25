// import { type ApiError } from '@lightdash/common';
// import { useQuery } from '@tanstack/react-query';

// interface EmbedExploreData {
//     exploreId: string;
//     metricQuery?: any;
//     chartConfig?: any;
//     tableConfig?: any;
//     pivotConfig?: any;
// }

// export const useEmbedExplore = (
//     projectUuid: string | undefined,
//     embedToken: string | undefined,
//     exploreId: string | undefined,
// ) => {
//     return useQuery<EmbedExploreData, ApiError>({
//         queryKey: ['embed-explore', projectUuid, embedToken, exploreId],
//         queryFn: async () => {
//             if (!projectUuid || !embedToken || !exploreId) {
//                 throw new Error('Missing required parameters');
//             }

//             // This is a placeholder - the actual endpoint will be implemented by the user
//             // For now, we'll return a basic structure
//             const response = await fetch(
//                 `/api/v1/projects/${projectUuid}/explores/${exploreId}/embed`,
//                 {
//                     headers: {
//                         Authorization: `Bearer ${embedToken}`,
//                     },
//                 },
//             );

//             if (!response.ok) {
//                 const error = await response.json();
//                 throw new Error(
//                     error.message || 'Failed to fetch explore data',
//                 );
//             }

//             return response.json();
//         },
//         enabled: !!projectUuid && !!embedToken && !!exploreId,
//     });
// };
