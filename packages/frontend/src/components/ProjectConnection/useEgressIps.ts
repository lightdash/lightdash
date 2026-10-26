import { parseEgressIps } from '@lightdash/common';
import useApp from '../../providers/App/useApp';

export const describeEgressIps = (count: number) =>
    count === 1
        ? { noun: 'IP address', pronoun: 'it' }
        : { noun: 'IP addresses', pronoun: 'them' };

export const useEgressIps = (): string[] => {
    const { health } = useApp();
    return parseEgressIps(health.data?.staticIp);
};
