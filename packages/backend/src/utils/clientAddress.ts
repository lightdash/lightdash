import { type Request } from 'express';
import { BlockList, isIP } from 'node:net';

const proxyHops = new BlockList();
proxyHops.addSubnet('127.0.0.0', 8, 'ipv4');
proxyHops.addSubnet('10.0.0.0', 8, 'ipv4');
proxyHops.addSubnet('172.16.0.0', 12, 'ipv4');
proxyHops.addSubnet('192.168.0.0', 16, 'ipv4');
proxyHops.addSubnet('169.254.0.0', 16, 'ipv4');
proxyHops.addAddress('::1', 'ipv6');
proxyHops.addSubnet('fc00::', 7, 'ipv6');
proxyHops.addSubnet('fe80::', 10, 'ipv6');

const normalize = (address: string): string => {
    const trimmed = address.trim();
    return trimmed.toLowerCase().startsWith('::ffff:') &&
        isIP(trimmed.slice(7)) === 4
        ? trimmed.slice(7)
        : trimmed;
};

const isProxyHop = (address: string): boolean => {
    const family = isIP(address);
    if (family === 0) return false;
    return proxyHops.check(address, family === 4 ? 'ipv4' : 'ipv6');
};

// Reads X-Forwarded-For only behind a private-network proxy with TRUST_PROXY
// on, from the right, so addresses a client prepends are ignored.
export const getClientAddress = (
    req: Pick<Request, 'socket' | 'get'>,
    trustProxy: boolean,
): string => {
    const socketAddress = normalize(req.socket.remoteAddress ?? '');
    if (!trustProxy || !isProxyHop(socketAddress)) {
        return socketAddress || 'unknown';
    }
    const forwarded = (req.get('x-forwarded-for') ?? '')
        .split(',')
        .map(normalize)
        .filter((address) => isIP(address) !== 0);
    for (let i = forwarded.length - 1; i >= 0; i -= 1) {
        if (!isProxyHop(forwarded[i]) || i === 0) return forwarded[i];
    }
    return socketAddress;
};
