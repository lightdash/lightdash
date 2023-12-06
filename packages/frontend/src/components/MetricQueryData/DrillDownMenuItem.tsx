import { MenuItem2 } from '@blueprintjs/popover2';
import {
    fieldId as getFieldId,
    hashFieldReference,
    isField,
    isMetric,
} from '@lightdash/common';
import { FC } from 'react';
import { useTracking } from '../../providers/TrackingProvider';
import { EventName } from '../../types/Events';
import {
    DrillDownConfig,
    useMetricQueryDataContext,
} from './MetricQueryDataProvider';

type DrillDownMenuItemProps = Partial<DrillDownConfig> & {
    trackingData: {
        organizationId: string | undefined;
        userId: string | undefined;
        projectId: string | undefined;
    };
};

const DrillDownMenuItem: FC<DrillDownMenuItemProps> = ({
    item,
    fieldValues,
    pivotReference,
    trackingData,
}) => {
    const { explore, metricQuery, openDrillDownModal } =
        useMetricQueryDataContext();
    const { track } = useTracking();

    if (
        item &&
        isField(item) &&
        isMetric(item) &&
        explore &&
        fieldValues &&
        metricQuery
    ) {
        const fieldId =
            pivotReference !== undefined
                ? hashFieldReference(pivotReference)
                : getFieldId(item);
        const value = fieldValues[fieldId]?.formatted;

        return (
            <MenuItem2
                text={`Drill into "${value}"`}
                icon="path"
                onClick={() => {
                    openDrillDownModal({
                        item,
                        fieldValues,
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
