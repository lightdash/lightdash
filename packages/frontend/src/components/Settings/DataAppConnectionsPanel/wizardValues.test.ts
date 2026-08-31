import { type ExternalConnectionConfigProposal } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    applyProposalToWizardValues,
    getSuggestedTestPath,
} from './wizardValues';

const proposal = (
    overrides: Partial<ExternalConnectionConfigProposal> = {},
): ExternalConnectionConfigProposal => ({
    name: 'Google Sheets',
    origin: 'https://sheets.googleapis.com',
    type: 'google_service_account',
    allowBrowserImages: false,
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
        expect(values.allowDataAppBuilderLinking).toBe(false);
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

    it('applies browser image access from the proposal', () => {
        const values = applyProposalToWizardValues(
            proposal({
                type: 'none',
                allowBrowserImages: true,
                allowedMethods: [],
            }),
        );
        expect(values.allowBrowserImages).toBe(true);
        expect(values.allowedMethods).toEqual([]);
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

describe('getSuggestedTestPath', () => {
    it('extracts the path from an example URL on the proposed origin', () => {
        expect(
            getSuggestedTestPath(
                'Plot maps using https://cdn.jsdelivr.net/npm/world-atlas/countries-110m.json',
                'https://cdn.jsdelivr.net',
            ),
        ).toBe('/npm/world-atlas/countries-110m.json');
    });

    it('finds a matching URL after unrelated links', () => {
        expect(
            getSuggestedTestPath(
                'See https://example.com/docs, then fetch <https://api.example.com/v1/items?limit=10>.',
                'https://api.example.com',
            ),
        ).toBe('/v1/items');
    });

    it('returns no suggestion for another origin or an origin-only URL', () => {
        expect(
            getSuggestedTestPath(
                'Use https://other.example.com/v1/items',
                'https://api.example.com',
            ),
        ).toBe('');
        expect(
            getSuggestedTestPath(
                'Use https://api.example.com/',
                'https://api.example.com',
            ),
        ).toBe('');
    });

    it('returns no suggestion for an invalid origin', () => {
        expect(
            getSuggestedTestPath(
                'Use https://api.example.com/v1/items',
                'api.example.com',
            ),
        ).toBe('');
    });
});
