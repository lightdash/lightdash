import { useRecentContent } from '../../../../hooks/useRecentContent';

const MAX_RECENT_ITEMS = 4;

export const useRecentContents = (projectUuid: string | undefined) => {
    const { data, isInitialLoading } = useRecentContent(projectUuid);
    return {
        recents: data ?? [],
        contents: (data ?? [])
            .slice(0, MAX_RECENT_ITEMS)
            .map((item) => item.content),
        isLoading: isInitialLoading,
    };
};
