import { type FC } from 'react';
import { EventFieldsForm } from '../../eventAnalytics/components/EventFieldsForm';
import { useAppDispatch, useAppSelector } from '../store';
import {
    selectBreakdownDimensionId,
    selectEventNameFieldId,
    selectExploreName,
    selectTimestampFieldId,
    selectUserIdFieldId,
    setBreakdownDimensionId,
    setEventNameFieldId,
    setExploreName,
    setTimestampFieldId,
    setUserIdFieldId,
} from '../store/retentionBuilderSlice';

type Props = {
    projectUuid: string;
};

export const RetentionFieldsTab: FC<Props> = ({ projectUuid }) => {
    const dispatch = useAppDispatch();

    return (
        <EventFieldsForm
            projectUuid={projectUuid}
            exploreName={useAppSelector(selectExploreName)}
            timestampFieldId={useAppSelector(selectTimestampFieldId)}
            userIdFieldId={useAppSelector(selectUserIdFieldId)}
            eventNameFieldId={useAppSelector(selectEventNameFieldId)}
            breakdownDimensionId={useAppSelector(selectBreakdownDimensionId)}
            onExploreChange={(value) => dispatch(setExploreName(value))}
            onTimestampFieldChange={(value) =>
                dispatch(setTimestampFieldId(value))
            }
            onUserIdFieldChange={(value) => dispatch(setUserIdFieldId(value))}
            onEventNameFieldChange={(value) =>
                dispatch(setEventNameFieldId(value))
            }
            onBreakdownChange={(value) =>
                dispatch(setBreakdownDimensionId(value))
            }
        />
    );
};
