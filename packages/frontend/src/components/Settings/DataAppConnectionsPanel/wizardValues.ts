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
    secret: string;
    apiKeyName: string;
    apiKeyLocation: ApiKeyLocation;
    oauthScopes: string[];
    customHeaders: CustomHeaderRow[];
    allowedMethods: ExternalConnectionMethod[];
    pathMode: PathMode;
    allowedPathPrefixes: PathPrefix[];
    instructions: string;
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
        secret: '',
        apiKeyName: proposal.apiKeyName ?? '',
        apiKeyLocation: proposal.apiKeyLocation ?? 'header',
        oauthScopes: proposal.oauthScopes ?? [],
        customHeaders: recordToCustomHeaderRows(proposal.customHeaders),
        allowedMethods: proposal.allowedMethods,
        pathMode: mode,
        allowedPathPrefixes: prefixes,
        instructions: proposal.instructions ?? '',
    };
};
