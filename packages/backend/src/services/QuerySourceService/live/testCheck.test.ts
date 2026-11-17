import {
    ApiConnectorType,
    type ExternalConnectionApiSource,
    type ExternalFetchResponse,
} from '@lightdash/common';
import { getLiveSourceTestCheck } from './testCheck';

const GITHUB: ExternalConnectionApiSource = {
    connector: ApiConnectorType.GITHUB,
    owner: 'octo',
    repo: 'app',
};
const META_ADS: ExternalConnectionApiSource = {
    connector: ApiConnectorType.META_ADS,
    adAccountId: '123',
};
const POSTHOG: ExternalConnectionApiSource = {
    connector: ApiConnectorType.POSTHOG,
    projectId: '42',
};
const PYLON: ExternalConnectionApiSource = {
    connector: ApiConnectorType.PYLON,
};

const respond = (
    status: number,
    body: unknown,
    headers: Record<string, string> = {},
): ExternalFetchResponse => ({
    status,
    contentType: 'application/json',
    headers,
    body,
    truncated: false,
});

describe('getLiveSourceTestCheck', () => {
    it('summarizes a GitHub repository it reached', () => {
        expect(
            getLiveSourceTestCheck(
                GITHUB,
                respond(200, { total_count: 1204, items: [] }),
            ),
        ).toEqual({
            ok: true,
            summary: 'Connected to octo/app',
            detail: null,
            facts: [{ label: 'Pull requests', value: '1,204' }],
        });
    });

    it('names the Meta Ads account and its spend', () => {
        expect(
            getLiveSourceTestCheck(
                META_ADS,
                respond(200, {
                    data: [
                        {
                            spend: '1234.5',
                            account_name: 'Acme',
                            account_currency: 'USD',
                        },
                    ],
                }),
            ),
        ).toMatchObject({
            ok: true,
            summary: 'Connected to ad account "Acme"',
            facts: [{ label: 'Spend in the last 7 days', value: '$1,234.50' }],
        });
    });

    it('reads an account with no spend as reached', () => {
        expect(
            getLiveSourceTestCheck(META_ADS, respond(200, { data: [] })),
        ).toMatchObject({
            ok: true,
            summary: 'Connected to ad account act_123',
            facts: [{ label: 'Spend in the last 7 days', value: 'None' }],
        });
    });

    it('counts PostHog event types and Pylon users', () => {
        expect(
            getLiveSourceTestCheck(POSTHOG, respond(200, { results: [[12]] }))
                .facts,
        ).toEqual([{ label: 'Event types in the last 7 days', value: '12' }]);
        expect(
            getLiveSourceTestCheck(PYLON, respond(200, { data: [{}, {}] }))
                .facts,
        ).toEqual([{ label: 'Workspace users', value: '2' }]);
    });

    it('falls back to a plain success for a body it does not know', () => {
        expect(getLiveSourceTestCheck(GITHUB, respond(200, 'ok'))).toEqual({
            ok: true,
            summary: 'Connected to GitHub',
            detail: null,
            facts: [],
        });
    });

    it('explains a rejected token with what to change', () => {
        const check = getLiveSourceTestCheck(
            GITHUB,
            respond(401, { message: 'Bad credentials' }),
        );
        expect(check).toMatchObject({
            ok: false,
            summary: "GitHub didn't accept the credentials",
            facts: [],
        });
        expect(check.detail).toContain('Create a new personal access token');
    });

    it('tells a forbidden account apart from a rejected token', () => {
        expect(
            getLiveSourceTestCheck(PYLON, respond(403, { message: 'nope' }))
                .summary,
        ).toBe("Signed in, but this account can't read from Pylon");
        expect(
            getLiveSourceTestCheck(
                META_ADS,
                respond(400, { error: { message: 'expired', code: 190 } }),
            ).summary,
        ).toBe('Meta Ads refused access');
    });

    it('reads a rate limit and a server error', () => {
        expect(getLiveSourceTestCheck(PYLON, respond(429, {})).summary).toBe(
            'Pylon is limiting requests right now',
        );
        expect(getLiveSourceTestCheck(PYLON, respond(502, {})).summary).toBe(
            'Pylon had a problem answering',
        );
    });
});
