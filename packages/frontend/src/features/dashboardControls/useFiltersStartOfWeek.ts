import { getDefaultStartOfWeek } from '@lightdash/common';
import useIsEmbedded from '../../ee/providers/Embed/useIsEmbedded';
import { useProject } from '../../hooks/useProject';

// An embed has no project request, so no start of week, as its shipped bar
export const useFiltersStartOfWeek = (projectUuid: string | undefined) => {
    const isEmbedded = useIsEmbedded();
    const project = useProject(isEmbedded ? undefined : projectUuid);
    const connection = project.data?.warehouseConnection;
    return connection
        ? (connection.startOfWeek ?? getDefaultStartOfWeek(connection.type))
        : undefined;
};
