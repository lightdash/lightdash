import {
    type LightdashProjectParameter,
    type ParameterValue,
} from '@lightdash/common';
import { type FC } from 'react';
import CalendarPickerInput from '../../../components/common/DatePickers/CalendarPickerInput';
import {
    parseParameterDateValue,
    serializeParameterDateValue,
} from '../utils/parameterDate';

type Props = {
    paramKey: string;
    parameter: LightdashProjectParameter;
    currentValue: string | null;
    onParameterChange: (paramKey: string, value: ParameterValue | null) => void;
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
    disabled?: boolean;
    isError?: boolean;
};

// Reasonable date range constraints
const MIN_PARAMETER_DATE = new Date(1900, 0, 1);
const MAX_PARAMETER_DATE = new Date(2100, 11, 31);

const ParameterDateInput: FC<Props> = ({
    paramKey,
    parameter,
    currentValue,
    onParameterChange,
    size,
    disabled,
    isError,
}) => {
    const currentDate = parseParameterDateValue(currentValue);
    const defaultValue =
        typeof parameter.default === 'string'
            ? parseParameterDateValue(parameter.default)
            : null;

    return (
        <CalendarPickerInput
            value={currentDate || defaultValue}
            onChange={(date) =>
                onParameterChange(paramKey, serializeParameterDateValue(date))
            }
            firstDayOfWeek={0}
            size={size}
            clearable
            disabled={disabled}
            error={isError}
            minDate={MIN_PARAMETER_DATE}
            maxDate={MAX_PARAMETER_DATE}
            popoverProps={{
                shadow: 'sm',
                withinPortal: false,
                zIndex: 10000,
            }}
        />
    );
};

export default ParameterDateInput;
