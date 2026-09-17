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
 * (`YYYY-MM-DD`, local time of the caller). Any other default is returned as-is.
 */
export const resolveParameterDefault = (
    definition: LightdashProjectParameter,
    now: Date = new Date(),
): ParameterValue | undefined =>
    isTodayParameterDefault(definition)
        ? formatDate(now, TimeFrames.DAY)
        : definition.default;
