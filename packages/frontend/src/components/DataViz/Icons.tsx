import { type DimensionType } from '@lightdash/common';
import {
    Icon123,
    IconAbc,
    IconCalendar,
    IconClockHour4,
    IconQuestionMark,
} from '@tabler/icons-react';
import { memo, useMemo, type FC } from 'react';
import { getItemIconName } from '../common/Filters/FieldIcon';
import MantineIcon from '../common/MantineIcon';

export const TableFieldIcon: FC<{
    fieldType: DimensionType;
}> = memo(({ fieldType }) => {
    const Icon = useMemo(() => {
        switch (getItemIconName(fieldType)) {
            case 'citation':
                return IconAbc;
            case 'numerical':
                return Icon123;
            case 'calendar':
                return IconCalendar;
            case 'time':
                return IconClockHour4;
            default:
                return IconQuestionMark;
        }
    }, [fieldType]);

    return <MantineIcon icon={Icon} color="gray.5" />;
});
