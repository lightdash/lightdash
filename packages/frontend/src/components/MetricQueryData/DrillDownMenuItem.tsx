import {
    getItemId,
    hashFieldReference,
    isField,
    isMetric,
} from '@lightdash/common';
import { Menu, Text } from '@mantine/core';
import { IconArrowBarToDown } from '@tabler/icons-react';
import { useCallback, useMemo, type FC } from 'react';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';
import MantineIcon from '../common/MantineIcon';
import { type DrillDownConfig } from './types';
import { useMetricQueryDataContext } from './useMetricQueryDataContext';

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
    source,
    trackingData,
}) => {
    const { explore, metricQuery, openDrillDownModal } =
        useMetricQueryDataContext();
    const { track } = useTracking();

    const fieldId = useMemo(() => {
        if (!item || !isField(item)) return undefined;

        return pivotReference !== undefined
            ? hashFieldReference(pivotReference)
            : getItemId(item);
    }, [item, pivotReference]);

    const value = fieldId ? fieldValues?.[fieldId]?.formatted : undefined;

    const handleDrillInto = useCallback(() => {
        if (!item || !openDrillDownModal || !fieldValues) {
            return;
        }

        openDrillDownModal({
            item,
            fieldValues,
            pivotReference,
            source,
        });
        track({
            name: EventName.DRILL_BY_CLICKED,
            properties: {
                organizationId: trackingData.organizationId,
                userId: trackingData.userId,
                projectId: trackingData.projectId,
            },
        });
    }, [
        fieldValues,
        item,
        openDrillDownModal,
        pivotReference,
        source,
        track,
        trackingData.organizationId,
        trackingData.projectId,
        trackingData.userId,
    ]);

    if (
        item &&
        isField(item) &&
        isMetric(item) &&
        (source || explore) &&
        fieldValues &&
        (source?.metricQuery || metricQuery)
    ) {
        return (
            <Menu.Item
                leftSection={<MantineIcon icon={IconArrowBarToDown} />}
                onClick={handleDrillInto}
            >
                <>
                    Drill into{' '}
                    <Text span fw="bold">
                        {value}
                    </Text>
                </>
            </Menu.Item>
        );
    }

    return null;
};

export default DrillDownMenuItem;
