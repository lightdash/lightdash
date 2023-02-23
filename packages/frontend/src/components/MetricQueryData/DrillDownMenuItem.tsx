import { MenuItem2 } from '@blueprintjs/popover2';
import {
    DashboardFilters,
    Field,
    fieldId as getFieldId,
    hashFieldReference,
    isField,
    isMetric,
    PivotReference,
    ResultRow,
    TableCalculation,
} from '@lightdash/common';
import { FC } from 'react';
import { useTracking } from '../../providers/TrackingProvider';
import { EventName } from '../../types/Events';
import { useMetricQueryDataContext } from './MetricQueryDataProvider';

export const DrillDownMenuItem: FC<{
    row: ResultRow | undefined;
    selectedItem: Field | TableCalculation | undefined;
    dashboardFilters?: DashboardFilters;
    pivotReference?: PivotReference;
    trackingData: {
        organizationId: string | undefined;
        userId: string | undefined;
        projectId: string | undefined;
    };
}> = ({
    row,
    selectedItem,
    dashboardFilters,
    pivotReference,
    trackingData,
}) => {
    const { explore, metricQuery, openDrillDownModel } =
        useMetricQueryDataContext();
    const { track } = useTracking();

    if (
        selectedItem &&
        isField(selectedItem) &&
        isMetric(selectedItem) &&
        explore &&
        row &&
        metricQuery
    ) {
        const fieldId =
            pivotReference !== undefined
                ? hashFieldReference(pivotReference)
                : getFieldId(selectedItem);
        const value = row[fieldId]?.value.formatted;

        return (
            <MenuItem2
                text={`Drill into "${value}"`}
                icon="path"
                onClick={() => {
                    openDrillDownModel({
                        row,
                        selectedItem,
                        dashboardFilters,
                        pivotReference,
                    });
                    track({
                        name: EventName.DRILL_BY_CLICKED,
                        properties: {
                            organizationId: trackingData.organizationId,
                            userId: trackingData.userId,
                            projectId: trackingData.projectId,
                        },
                    });
                }}
            />
        );
    }
    return null;
};

export default DrillDownMenuItem;
