import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import {
    selectSavedChart,
    useExplorerSelector,
} from '../../features/explorer/store';

const extractUuidFromCreateSavedChartVersionParam = (
    raw: string | null,
): string | undefined => {
    if (!raw) return undefined;
    try {
        const parsed: unknown = JSON.parse(raw);
        if (
            parsed &&
            typeof parsed === 'object' &&
            'uuid' in parsed &&
            typeof (parsed as { uuid: unknown }).uuid === 'string'
        ) {
            return (parsed as { uuid: string }).uuid;
        }
    } catch {
        // Malformed URL — caller falls through to undefined.
    }
    return undefined;
};

// The saved chart this explorer state originated from. Sources, in order:
//  1. Redux — `/saved/{uuid}` route loads the chart there.
//  2. `savedChartUuid` query param — modern "Explore from here" URLs.
//  3. `uuid` inside `create_saved_chart_version` — backward-compat for share
//     links generated before the param was added.
export const useSourceSavedChartUuid = (): string | undefined => {
    const savedChart = useExplorerSelector(selectSavedChart);
    const [searchParams] = useSearchParams();

    return useMemo(() => {
        if (savedChart?.uuid) return savedChart.uuid;
        const fromQueryParam = searchParams.get('savedChartUuid');
        if (fromQueryParam) return fromQueryParam;
        return extractUuidFromCreateSavedChartVersionParam(
            searchParams.get('create_saved_chart_version'),
        );
    }, [savedChart?.uuid, searchParams]);
};
