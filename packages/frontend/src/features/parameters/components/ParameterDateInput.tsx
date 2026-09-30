import {
    DEFAULT_UI_STRINGS,
    formatDate,
    interpolateUiString,
    resolveParameterDefault,
    TimeFrames,
    type LightdashProjectParameter,
    type ParameterValue,
    type UiStringResolver,
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
    getUiString?: UiStringResolver;
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
    getUiString,
}) => {
    const currentDate = parseParameterDateValue(currentValue);
    const resolvedDefault = resolveParameterDefault(parameter);
    const defaultValue =
        typeof resolvedDefault === 'string'
            ? parseParameterDateValue(resolvedDefault)
            : null;
    const displayLabel = parameter.label || paramKey;
    const placeholder = defaultValue
        ? interpolateUiString(
              getUiString?.('parameters.defaultValue') ??
                  DEFAULT_UI_STRINGS['parameters.defaultValue'],
              { value: formatDate(defaultValue, TimeFrames.DAY, false) },
          )
        : (getUiString?.('parameters.selectValue') ??
          DEFAULT_UI_STRINGS['parameters.selectValue']);

    return (
        <CalendarPickerInput
            value={currentDate}
            placeholder={placeholder}
            aria-label={displayLabel}
            clearButtonProps={{
                'aria-hidden': false,
                tabIndex: 0,
                'aria-label': interpolateUiString(
                    getUiString?.('parameters.clearNamed') ??
                        DEFAULT_UI_STRINGS['parameters.clearNamed'],
                    { name: displayLabel },
                ),
            }}
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
