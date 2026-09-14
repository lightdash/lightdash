import { ParameterError } from '@lightdash/common';
import * as ipaddr from 'ipaddr.js';
import { lookup } from 'node:dns/promises';

const PRIVATE_HOSTNAMES = new Set(['localhost']);
const MCP_PRIVATE_ADDRESS_ERROR_MESSAGE =
    'MCP servers must use a public URL. Localhost and private network addresses are not supported.';
const MCP_INVALID_URL_ERROR_MESSAGE =
    'Enter a valid MCP server URL, including http:// or https://.';
const MCP_INVALID_PROTOCOL_ERROR_MESSAGE =
    'MCP server URLs must start with http:// or https://.';
const MCP_URL_CREDENTIALS_ERROR_MESSAGE =
    'Remove the username or password from the MCP server URL. Use the auth settings instead.';
const MCP_HOSTNAME_LOOKUP_ERROR_MESSAGE =
    "We couldn't find a server at that URL. Check the hostname and try again.";

const WEBHOOK_PRIVATE_ADDRESS_ERROR_MESSAGE =
    'Webhook destinations must use a public URL. Localhost and private network addresses are not supported.';
const WEBHOOK_INVALID_URL_ERROR_MESSAGE =
    'Enter a valid webhook URL, including https://.';
const WEBHOOK_INVALID_PROTOCOL_ERROR_MESSAGE =
    'Webhook URLs must start with https://.';
const WEBHOOK_URL_CREDENTIALS_ERROR_MESSAGE =
    'Remove the username or password from the webhook URL.';
const WEBHOOK_HOSTNAME_LOOKUP_ERROR_MESSAGE =
    "We couldn't find a server at that webhook URL. Check the hostname and try again.";

type PublicHttpUrlContext = 'mcp' | 'webhook';

const getErrorMessages = (context: PublicHttpUrlContext) =>
    context === 'webhook'
        ? {
              privateAddress: WEBHOOK_PRIVATE_ADDRESS_ERROR_MESSAGE,
              invalidUrl: WEBHOOK_INVALID_URL_ERROR_MESSAGE,
              invalidProtocol: WEBHOOK_INVALID_PROTOCOL_ERROR_MESSAGE,
              urlCredentials: WEBHOOK_URL_CREDENTIALS_ERROR_MESSAGE,
              hostnameLookup: WEBHOOK_HOSTNAME_LOOKUP_ERROR_MESSAGE,
          }
        : {
              privateAddress: MCP_PRIVATE_ADDRESS_ERROR_MESSAGE,
              invalidUrl: MCP_INVALID_URL_ERROR_MESSAGE,
              invalidProtocol: MCP_INVALID_PROTOCOL_ERROR_MESSAGE,
              urlCredentials: MCP_URL_CREDENTIALS_ERROR_MESSAGE,
              hostnameLookup: MCP_HOSTNAME_LOOKUP_ERROR_MESSAGE,
          };

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
        context?: PublicHttpUrlContext;
    } = {},
): Promise<URL> => {
    const allowedProtocols = options.allowedProtocols ?? ['https:'];
    const errorMessages = getErrorMessages(options.context ?? 'mcp');

    let parsedUrl: URL;
    try {
        parsedUrl = new URL(rawUrl);
    } catch {
        throw new ParameterError(errorMessages.invalidUrl);
    }

    if (!allowedProtocols.includes(parsedUrl.protocol)) {
        throw new ParameterError(errorMessages.invalidProtocol);
    }

    if (parsedUrl.username || parsedUrl.password) {
        throw new ParameterError(errorMessages.urlCredentials);
    }

    if (options.allowPrivateAddresses) {
        return parsedUrl;
    }

    const hostname = normalizeHostname(parsedUrl.hostname);
    if (isPrivateAddress(hostname)) {
        throw new ParameterError(errorMessages.privateAddress);
    }

    let addresses: { address: string }[];
    try {
        addresses = await lookup(hostname, { all: true });
    } catch {
        throw new ParameterError(errorMessages.hostnameLookup);
    }

    if (
        addresses.length === 0 ||
        addresses.some(({ address }) => isPrivateAddress(address))
    ) {
        throw new ParameterError(errorMessages.privateAddress);
    }

    return parsedUrl;
};
