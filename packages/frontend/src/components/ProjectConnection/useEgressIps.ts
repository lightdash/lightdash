import { FeatureFlags, parseEgressIps } from '@lightdash/common';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../providers/App/useApp';

export const useEgressIps = (): string[] => {
    const { health } = useApp();
    const flag = useServerFeatureFlag(FeatureFlags.EgressIpNotice);
    if (flag.data?.enabled === false) return [];
    return parseEgressIps(health.data?.staticIp);
};
