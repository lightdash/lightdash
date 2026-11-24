import { assertUnreachable } from '@lightdash/common';
import { type FC } from 'react';
import {
    useDashboardChartReturn,
    type DashboardChartAction,
} from '../NavBar/useDashboardChartReturn';
import { NoticeGutter } from './NoticeGutter';

type Props = {
    projectUuid: string | undefined;
};

const getTitle = (action: DashboardChartAction) => {
    switch (action) {
        case 'viewing':
            return null;
        case 'editing':
            return 'Editing from a dashboard';
        case 'creating':
            return 'Creating for a dashboard';
        default:
            return assertUnreachable(action, 'Unknown dashboard chart action');
    }
};

const getHint = (action: DashboardChartAction) => {
    switch (action) {
        case 'viewing':
            return null;
        case 'editing':
            return 'Saved changes update the chart in the dashboard';
        case 'creating':
            return 'The chart will be added to the dashboard as a tile';
        default:
            return assertUnreachable(action, 'Unknown dashboard chart action');
    }
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

    const title = getTitle(action);
    if (title === null) {
        return null;
    }

    return (
        <NoticeGutter
            tone="neutral"
            icon={null}
            title={isCancelling ? 'Cancelling…' : title}
            hint={getHint(action)}
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
