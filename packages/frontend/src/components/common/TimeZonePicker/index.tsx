import { FeatureFlags, TimeZone } from '@lightdash/common';
import { Select, type SelectProps } from '@mantine/core';
import dayjs from 'dayjs';
import React, { useMemo, type FC } from 'react';
import { useFeatureFlagEnabled } from '../../../hooks/useFeatureFlagEnabled';
import { useExplorerContext } from '../../../providers/ExplorerProvider';

export interface TimeZonePickerProps extends Omit<SelectProps, 'data'> {}

const TimeZonePicker: FC<TimeZonePickerProps> = ({ onChange, ...rest }) => {
    // TODO: for now this is only on the explores page.
    // These context interactions should go into a wrapper
    // when we add this to the dashboard page.
    const selectedTimeZone = useExplorerContext(
        (context) => context.state.unsavedChartVersion.metricQuery.timezone,
    );
    const setTimeZone = useExplorerContext(
        (context) => context.actions.setTimeZone,
    );

    const timeZoneOptions = useMemo(
        () =>
            Object.keys(TimeZone)
                .filter((key) => isNaN(Number(key)))
                .map((key) => {
                    const labelText =
                        dayjs.tz.guess() === key ? `${key} (Local)` : key;
                    return { label: labelText, value: key };
                }),
        [],
    );

    // FEATURE FLAG: this component doesn't appear when the feature flag is disabled
    const userTimeZonesEnabled = useFeatureFlagEnabled(
        FeatureFlags.EnableUserTimezones,
    );
    if (!userTimeZonesEnabled) return null;

    return (
        <Select
            variant="filled"
            w={150}
            size="xs"
            value={selectedTimeZone || TimeZone.UTC}
            data={timeZoneOptions}
            onChange={setTimeZone}
            {...rest}
        />
    );
};

export default TimeZonePicker;
