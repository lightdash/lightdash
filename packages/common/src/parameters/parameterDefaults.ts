import { type LightdashProjectParameter } from '../types/lightdashProjectConfig';
import { type ParameterValue } from '../types/parameters';
import { TimeFrames } from '../types/timeFrames';
import { formatDate } from '../utils/formatting';

/**
 * Sentinel `default` for a `date` parameter that resolves to the current date every time
 * it is read, instead of a static `YYYY-MM-DD` literal that drifts after deploy.
 */
export const TODAY_PARAMETER_DEFAULT = 'today';

export const isTodayParameterDefault = (
    definition: LightdashProjectParameter,
): boolean =>
    definition.type === 'date' &&
    definition.default === TODAY_PARAMETER_DEFAULT;

/**
 * The definition's default value with the `today` sentinel resolved to the current date
 * (`YYYY-MM-DD`). The date is taken in `timezone` when given (an IANA zone such as the
 * project's query timezone), otherwise in the caller's local time. Any other default is
 * returned as-is.
 */
export const resolveParameterDefault = (
    definition: LightdashProjectParameter,
    now: Date = new Date(),
    timezone?: string,
): ParameterValue | undefined =>
    isTodayParameterDefault(definition)
        ? formatDate(now, TimeFrames.DAY, false, timezone)
        : definition.default;
