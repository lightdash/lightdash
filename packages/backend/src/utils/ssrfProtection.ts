import { ParameterError } from '@lightdash/common';
import * as ipaddr from 'ipaddr.js';
import { lookup } from 'node:dns/promises';

const PRIVATE_HOSTNAMES = new Set(['localhost']);
const PRIVATE_ADDRESS_ERROR_MESSAGE =
    'MCP servers must use a public URL. Localhost and private network addresses are not supported.';
const INVALID_URL_ERROR_MESSAGE =
    'Enter a valid MCP server URL, including http:// or https://.';
const INVALID_PROTOCOL_ERROR_MESSAGE =
    'MCP server URLs must start with http:// or https://.';
const URL_CREDENTIALS_ERROR_MESSAGE =
    'Remove the username or password from the MCP server URL. Use the auth settings instead.';
const HOSTNAME_LOOKUP_ERROR_MESSAGE =
    "We couldn't find a server at that URL. Check the hostname and try again.";

const normalizeHostname = (hostname: string): string =>
    hostname.replace(/^\[/, '').replace(/\]$/, '').toLowerCase();

// ipaddr.js classifies reserved and special-use ranges as unicast even though
// they are not safe public destinations.
const NON_PUBLIC_IPV4_UNICAST_RANGES = [
    '192.0.0.0/24',
    '192.88.99.0/24',
    '198.18.0.0/15',
].map((cidr) => ipaddr.parseCIDR(cidr)) as [ipaddr.IPv4, number][];

const ASSIGNABLE_IPV6_GLOBAL_UNICAST_RANGE = ipaddr.parseCIDR('2000::/3') as [
    ipaddr.IPv6,
    number,
];

const NON_PUBLIC_IPV6_UNICAST_RANGES = [
    '2001::/23',
    '2001:db8::/32',
    '2002::/16',
    '3fff::/20',
].map((cidr) => ipaddr.parseCIDR(cidr)) as [ipaddr.IPv6, number][];

const isNonPublicUnicastAddress = (
    address: ipaddr.IPv4 | ipaddr.IPv6,
): boolean => {
    if (address.kind() === 'ipv4') {
        return NON_PUBLIC_IPV4_UNICAST_RANGES.some((range) =>
            (address as ipaddr.IPv4).match(range),
        );
    }

    const ipv6Address = address as ipaddr.IPv6;
    return (
        !ipv6Address.match(ASSIGNABLE_IPV6_GLOBAL_UNICAST_RANGE) ||
        NON_PUBLIC_IPV6_UNICAST_RANGES.some((range) => ipv6Address.match(range))
    );
};

export const isPrivateAddress = (address: string): boolean => {
    const normalizedAddress = normalizeHostname(address);

    if (PRIVATE_HOSTNAMES.has(normalizedAddress)) {
        return true;
    }

    if (!ipaddr.isValid(normalizedAddress)) {
        return false;
    }

    const parsedAddress = ipaddr.process(normalizedAddress);
    return (
        parsedAddress.range() !== 'unicast' ||
        isNonPublicUnicastAddress(parsedAddress)
    );
};

export const validatePublicHttpUrl = async (
    rawUrl: string,
    options: {
        allowedProtocols?: string[];
        allowPrivateAddresses?: boolean;
    } = {},
): Promise<URL> => {
    const allowedProtocols = options.allowedProtocols ?? ['https:'];

    let parsedUrl: URL;
    try {
        parsedUrl = new URL(rawUrl);
    } catch {
        throw new ParameterError(INVALID_URL_ERROR_MESSAGE);
    }

    if (!allowedProtocols.includes(parsedUrl.protocol)) {
        throw new ParameterError(INVALID_PROTOCOL_ERROR_MESSAGE);
    }

    if (parsedUrl.username || parsedUrl.password) {
        throw new ParameterError(URL_CREDENTIALS_ERROR_MESSAGE);
    }

    if (options.allowPrivateAddresses) {
        return parsedUrl;
    }

    const hostname = normalizeHostname(parsedUrl.hostname);
    if (isPrivateAddress(hostname)) {
        throw new ParameterError(PRIVATE_ADDRESS_ERROR_MESSAGE);
    }

    let addresses: { address: string }[];
    try {
        addresses = await lookup(hostname, { all: true });
    } catch {
        throw new ParameterError(HOSTNAME_LOOKUP_ERROR_MESSAGE);
    }

    if (addresses.some(({ address }) => isPrivateAddress(address))) {
        throw new ParameterError(PRIVATE_ADDRESS_ERROR_MESSAGE);
    }

    return parsedUrl;
};
