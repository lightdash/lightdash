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

export const isPrivateAddress = (address: string): boolean => {
    const normalizedAddress = normalizeHostname(address);

    if (PRIVATE_HOSTNAMES.has(normalizedAddress)) {
        return true;
    }

    if (!ipaddr.isValid(normalizedAddress)) {
        return false;
    }

    return ipaddr.process(normalizedAddress).range() !== 'unicast';
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

    if (isPrivateAddress(parsedUrl.hostname)) {
        throw new ParameterError(PRIVATE_ADDRESS_ERROR_MESSAGE);
    }

    let addresses: { address: string }[];
    try {
        addresses = await lookup(parsedUrl.hostname, { all: true });
    } catch {
        throw new ParameterError(HOSTNAME_LOOKUP_ERROR_MESSAGE);
    }

    if (addresses.some(({ address }) => isPrivateAddress(address))) {
        throw new ParameterError(PRIVATE_ADDRESS_ERROR_MESSAGE);
    }

    return parsedUrl;
};
