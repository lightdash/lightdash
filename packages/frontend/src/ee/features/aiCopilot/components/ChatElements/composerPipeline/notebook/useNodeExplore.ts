import { useExploreByProjectUuid } from '../../../../../../../hooks/useExplore';

// Labels fall back to field ids, so a failed explore load stays silent.
export const useNodeExplore = (exploreName: string, projectUuid: string) =>
    useExploreByProjectUuid(exploreName, projectUuid, {
        onError: () => {},
    }).data;
