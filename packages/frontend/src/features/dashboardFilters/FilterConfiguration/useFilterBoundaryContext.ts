import {
    resolveQueryTimezone,
    getDefaultStartOfWeek,
    SupportedDbtAdapter,
    getFilterBoundaryFieldContext,
    type FilterableItem,
    type FilterBoundaryContext,
} from '@lightdash/common';
import useFiltersContext from '../../../components/common/Filters/useFiltersContext';
import { useUiStrings } from '../../../ee/providers/Embed/useUiStrings';
import { useProject } from '../../../hooks/useProject';
import { useSessionTimezone } from '../../../hooks/useSessionTimezone';
import useApp from '../../../providers/App/useApp';

export const useFilterBoundaryContext = (
    field?: FilterableItem,
): FilterBoundaryContext => {
    const { projectUuid, startOfWeek, metricQueryTimezone } =
        useFiltersContext();
    const { data: project } = useProject(projectUuid);
    const sessionTimezone = useSessionTimezone();
    const { user } = useApp();
    const getUiString = useUiStrings();
    return {
        ...getFilterBoundaryFieldContext(field),
        timezone: resolveQueryTimezone({
            sessionTimezone,
            metricQuery: { timezone: metricQueryTimezone },
            projectTimezone: project?.queryTimezone ?? 'UTC',
            userTimezone: user.data?.timezone ?? null,
        }),
        startOfWeek:
            startOfWeek ??
            getDefaultStartOfWeek(
                project?.warehouseConnection?.type ??
                    SupportedDbtAdapter.POSTGRES,
            ),
        getUiString,
    };
};
