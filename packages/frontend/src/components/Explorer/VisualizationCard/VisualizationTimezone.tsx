import { getTimezoneLabel } from '@lightdash/common';
import { Badge, Tooltip } from '@mantine-8/core';
import { IconClock } from '@tabler/icons-react';
import { type FC } from 'react';
import { getTimezoneSourceLabel } from '../../../utils/timezoneSourceLabel';
import MantineIcon from '../../common/MantineIcon';

type Props = {
    resolvedTimezone: string | null | undefined;
    // The saved chart's single `timezone` setting, used to explain where the
    // resolved zone came from (project default / per-viewer / override).
    timezoneSetting: string | null | undefined;
};

const VisualizationTimezone: FC<Props> = ({
    resolvedTimezone,
    timezoneSetting,
}) => {
    if (!resolvedTimezone) return null;

    return (
        <Tooltip
            label={getTimezoneSourceLabel(timezoneSetting, resolvedTimezone)}
            position="bottom"
            multiline
            w={260}
        >
            <Badge
                leftSection={<MantineIcon icon={IconClock} size="sm" />}
                color="ldGray.6"
                variant="transparent"
                size="sm"
                tt="none"
            >
                {getTimezoneLabel(resolvedTimezone)}
            </Badge>
        </Tooltip>
    );
};

export default VisualizationTimezone;
