import { type ExternalConnectionConfigProposal } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { applyProposalToWizardValues } from './wizardValues';

const proposal = (
    overrides: Partial<ExternalConnectionConfigProposal> = {},
): ExternalConnectionConfigProposal => ({
    name: 'Google Sheets',
    origin: 'https://sheets.googleapis.com',
    type: 'google_service_account',
    apiKeyName: null,
    apiKeyLocation: null,
    oauthScopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    customHeaders: null,
    allowedMethods: ['GET'],
    allowedPathPrefixes: ['/v4/spreadsheets'],
    instructions: 'Read values via GET /v4/spreadsheets/{id}/values/{range}',
    credentialGuide: '1. Create a service account',
    docsUrl: 'https://developers.google.com/sheets/api',
    notes: null,
    ...overrides,
});

describe('applyProposalToWizardValues', () => {
    it('never carries a secret and maps auth fields with fallbacks', () => {
        const values = applyProposalToWizardValues(
            proposal({
                type: 'api_key',
                apiKeyName: 'x-api-key',
                apiKeyLocation: null,
                oauthScopes: null,
            }),
        );
        expect(values.secret).toBe('');
        expect(values.apiKeyName).toBe('x-api-key');
        expect(values.apiKeyLocation).toBe('header');
        expect(values.oauthScopes).toEqual([]);
    });

    it('derives restricted path mode from specific prefixes', () => {
        const values = applyProposalToWizardValues(proposal());
        expect(values.pathMode).toBe('restricted');
        expect(values.allowedPathPrefixes.map((p) => p.value)).toEqual([
            '/v4/spreadsheets',
        ]);
    });

    it('derives allow-all path mode from a root prefix', () => {
        const values = applyProposalToWizardValues(
            proposal({ allowedPathPrefixes: ['/'] }),
        );
        expect(values.pathMode).toBe('all');
        expect(values.allowedPathPrefixes).toEqual([]);
    });

    it('converts custom headers to editable rows and carries instructions', () => {
        const values = applyProposalToWizardValues(
            proposal({
                customHeaders: { 'anthropic-version': '2023-06-01' },
                instructions: 'Use POST /v1/messages',
            }),
        );
        expect(values.customHeaders).toEqual([
            { name: 'anthropic-version', value: '2023-06-01' },
        ]);
        expect(values.instructions).toBe('Use POST /v1/messages');
    });
});
