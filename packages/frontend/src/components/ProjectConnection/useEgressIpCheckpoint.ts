import { FeatureFlags, parseEgressIps } from '@lightdash/common';
import { useState } from 'react';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../providers/App/useApp';

export const describeEgressIps = (count: number) =>
    count === 1
        ? { noun: 'this IP address', pronoun: 'it' }
        : { noun: 'these IP addresses', pronoun: 'them' };

export const useEgressIps = (): string[] => {
    const { health } = useApp();
    const flag = useServerFeatureFlag(FeatureFlags.EgressIpNotice);
    if (flag.data?.enabled === false) return [];
    return parseEgressIps(health.data?.staticIp);
};

export const useEgressIpCheckpoint = () => {
    const ips = useEgressIps();
    const [pending, setPending] = useState<(() => void) | null>(null);
    const [isAllowlistConfirmed, setIsAllowlistConfirmed] = useState(false);

    const guard = (onContinue: () => void) => {
        if (ips.length === 0) {
            onContinue();
            return;
        }
        setPending(() => onContinue);
    };

    const confirm = () => {
        if (!isAllowlistConfirmed) return;
        setPending(null);
        pending?.();
    };

    const back = () => setPending(null);

    return {
        ips,
        isOpen: pending !== null,
        isAllowlistConfirmed,
        setIsAllowlistConfirmed,
        guard,
        confirm,
        back,
    };
};

export type EgressIpCheckpoint = ReturnType<typeof useEgressIpCheckpoint>;
