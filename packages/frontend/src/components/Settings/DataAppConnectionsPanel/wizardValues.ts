import {
    type ApiKeyLocation,
    type ExternalConnectionAuthType,
    type ExternalConnectionConfigProposal,
    type ExternalConnectionMethod,
} from '@lightdash/common';
import {
    recordToCustomHeaderRows,
    type CustomHeaderRow,
} from '../../../features/externalConnections/utils/customHeaders';
import {
    derivePathRules,
    type PathMode,
    type PathPrefix,
} from '../../../features/externalConnections/utils/pathRules';

export type WizardValues = {
    name: string;
    origin: string;
    type: ExternalConnectionAuthType;
    allowBrowserImages: boolean;
    allowDataAppBuilderLinking: boolean;
    secret: string;
    apiKeyName: string;
    apiKeyLocation: ApiKeyLocation;
    oauthScopes: string[];
    oauthTokenUrl: string;
    oauthClientId: string;
    oauthClientAuthMethod: 'basic' | 'body';
    customHeaders: CustomHeaderRow[];
    allowedMethods: ExternalConnectionMethod[];
    pathMode: PathMode;
    allowedPathPrefixes: PathPrefix[];
    instructions: string;
};

const DESCRIPTION_URL_PATTERN = /https:\/\/\S+/gi;
const TRAILING_URL_PUNCTUATION = /[>\])},.!?;:]+$/;

/** Find the first concrete URL in the automatic-setup description that uses
 *  the proposed origin, and return its path for the wizard's test request. */
export const getSuggestedTestPath = (
    description: string,
    origin: string,
): string => {
    let normalizedOrigin: string;
    try {
        const originUrl = new URL(origin);
        if (originUrl.protocol !== 'https:') return '';
        normalizedOrigin = originUrl.origin;
    } catch {
        return '';
    }

    for (const match of description.matchAll(DESCRIPTION_URL_PATTERN)) {
        const value = match[0].replace(TRAILING_URL_PUNCTUATION, '');
        try {
            const url = new URL(value);
            if (url.origin === normalizedOrigin && url.pathname !== '/') {
                return url.pathname;
            }
        } catch {
            // Continue looking for another URL in the description.
        }
    }

    return '';
};

/** Map an AI proposal onto the wizard form. The secret is always blank — the
 *  user pastes the credential themselves on the Auth step. */
export const applyProposalToWizardValues = (
    proposal: ExternalConnectionConfigProposal,
): WizardValues => {
    const { mode, prefixes } = derivePathRules(proposal.allowedPathPrefixes);
    return {
        name: proposal.name,
        origin: proposal.origin,
        type: proposal.type,
        allowBrowserImages: proposal.allowBrowserImages,
        allowDataAppBuilderLinking: false,
        secret: '',
        apiKeyName: proposal.apiKeyName ?? '',
        apiKeyLocation: proposal.apiKeyLocation ?? 'header',
        oauthScopes: proposal.oauthScopes ?? [],
        oauthTokenUrl: proposal.oauthTokenUrl ?? '',
        oauthClientId: proposal.oauthClientId ?? '',
        oauthClientAuthMethod: proposal.oauthClientAuthMethod ?? 'basic',
        customHeaders: recordToCustomHeaderRows(proposal.customHeaders),
        allowedMethods: proposal.allowedMethods,
        pathMode: mode,
        allowedPathPrefixes: prefixes,
        instructions: proposal.instructions ?? '',
    };
};
