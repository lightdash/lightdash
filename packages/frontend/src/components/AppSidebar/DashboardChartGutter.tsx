import { type FC } from 'react';
import {
    useDashboardChartReturn,
    type DashboardChartAction,
} from '../NavBar/useDashboardChartReturn';
import { NoticeGutter } from './NoticeGutter';

type Props = {
    projectUuid: string | undefined;
};

// Only a task with a way out is announced; viewing a chart is not one.
const NOTICE_COPY: Record<
    DashboardChartAction,
    { title: string; hint: string } | null
> = {
    viewing: null,
    editing: {
        title: 'Editing from a dashboard',
        hint: 'Saved changes update the chart in the dashboard',
    },
    creating: {
        title: 'Creating for a dashboard',
        hint: 'The chart will be added to the dashboard as a tile',
    },
};

/** Says a chart is being edited or created for a dashboard, and offers the way out. */
export const DashboardChartGutter: FC<Props> = ({ projectUuid }) => {
    const {
        action,
        isCancelling,
        cancelButtonText,
        cancelButtonTooltipText,
        handleOnCancel,
    } = useDashboardChartReturn(projectUuid);

    const copy = NOTICE_COPY[action];
    if (copy === null) {
        return null;
    }

    return (
        <NoticeGutter
            tone="neutral"
            icon={null}
            title={isCancelling ? 'Cancelling…' : copy.title}
            hint={copy.hint}
            detail={null}
            action={{
                type: 'back',
                label: cancelButtonText,
                hint: cancelButtonTooltipText,
                onClick: handleOnCancel,
            }}
        />
    );
};
