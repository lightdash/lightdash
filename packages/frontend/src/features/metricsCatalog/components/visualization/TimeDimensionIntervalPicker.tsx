import { TimeFrames, type TimeDimensionConfig } from '@lightdash/common';
import { Select } from '@mantine/core';
import { IconChevronDown } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import MantineIcon from '../../../../components/common/MantineIcon';
import { useUiStrings } from '../../../../ee/providers/Embed/useUiStrings';
import selectStyles from '../../styles/selectStyles.module.css';

type Props = {
    dimension: TimeDimensionConfig;
    onChange: (timeDimensionOverride: TimeDimensionConfig) => void;
};

export const TimeDimensionIntervalPicker: FC<Props> = ({
    dimension,
    onChange,
}) => {
    const getUiString = useUiStrings();
    const { t } = useTranslation('metricsCatalog');
    const [optimisticInterval, setOptimisticInterval] = useState(
        dimension.interval,
    );
    return (
        <Select
            aria-label={getUiString('metrics.granularity')}
            allowDeselect={false}
            w={100}
            size="xs"
            color="gray"
            data={[
                {
                    value: TimeFrames.DAY,
                    label: t('intervals.daily'),
                },
                {
                    value: TimeFrames.WEEK,
                    label: t('intervals.weekly'),
                },
                {
                    value: TimeFrames.MONTH,
                    label: t('intervals.monthly'),
                },
                {
                    value: TimeFrames.YEAR,
                    label: t('intervals.yearly'),
                },
            ]}
            value={optimisticInterval}
            onChange={(value) => {
                if (!value) return;
                const interval = value as TimeFrames;
                setOptimisticInterval(interval);

                onChange({
                    interval,
                    field: dimension.field,
                    table: dimension.table,
                });
            }}
            comboboxProps={{ withinPortal: true }}
            rightSection={
                <MantineIcon
                    color="ldGray.7"
                    icon={IconChevronDown}
                    size={12}
                />
            }
            classNames={{
                wrapper: selectStyles.wrapper,
                input: selectStyles.input,
                option: selectStyles.option,
                section: selectStyles.rightSection,
            }}
        />
    );
};
