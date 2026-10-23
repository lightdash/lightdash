import type { LightdashConfig } from '../../config/parseConfig';

// The one question every pre-aggregate entry point asks. On for every
// organization when the instance has a licence, PRE_AGGREGATES_ENABLED=true
// and pre-aggregate results storage (S3); there is no per-organization switch.
export const isPreAggregatesEnabled = (
    lightdashConfig: Pick<LightdashConfig, 'preAggregates'>,
): boolean => lightdashConfig.preAggregates.enabled;
