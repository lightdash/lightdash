import { z } from 'zod';
import { projectUuid } from '../lib/agents';
import { resultsOf } from '../lib/api';
import { optInEnabled } from '../lib/env';
import { expect, test } from '../lib/fixtures';
import { reportObservation } from '../lib/report';

// Plan T8.6 (O). Persists nothing. The product always proposes with an
// Anthropic model (Bedrock when that is the org default), whatever the org's
// provider is; without one it answers the documented MissingConfigError.

const DESCRIPTION =
    'Read open issues and pull requests from public repositories through the GitHub REST API for a data app.';
const NOT_CONFIGURED = 'AI is not configured for this organization';

// ExternalConnectionConfigProposal, the API shape after the server has
// validated and normalised the model's ProposalSchema output.
const proposalSchema = z.object({
    name: z.string().min(1),
    origin: z.url({ protocol: /^https$/ }),
    type: z.enum(['none', 'api_key', 'bearer_token', 'google_service_account']),
    allowBrowserImages: z.boolean(),
    apiKeyName: z.string().nullable(),
    apiKeyLocation: z.enum(['header', 'query']).nullable(),
    oauthScopes: z.array(z.string()).nullable(),
    customHeaders: z.record(z.string(), z.string()).nullable(),
    allowedMethods: z.array(z.string()).min(1),
    allowedPathPrefixes: z.array(z.string().startsWith('/')),
    instructions: z.string().nullable(),
    credentialGuide: z.string().nullable(),
    docsUrl: z.string().nullable(),
    notes: z.string().nullable(),
});

test.skip(
    !optInEnabled,
    'opt-in (O): set E2E_AI_OPT_IN=1; the proposal needs an Anthropic or Bedrock model on the backend',
);

test('T8.6 External connection config proposal', async ({ api }) => {
    const reply = await api.send(
        'POST',
        `/api/v1/ee/projects/${projectUuid}/external-connections/propose-config`,
        { description: DESCRIPTION },
    );
    test.skip(
        reply.status === 422 && reply.text.includes(NOT_CONFIGURED),
        `the documented MissingConfigError: "${NOT_CONFIGURED}" (no Anthropic or Bedrock model configured)`,
    );
    expect(reply.status, reply.text).toBe(200);
    const proposal = resultsOf(reply, proposalSchema);
    reportObservation(
        `proposed ${proposal.name} at ${proposal.origin} (${proposal.type}), ${proposal.allowedMethods.join('/')} on ${proposal.allowedPathPrefixes.join(', ')}`,
    );
});
