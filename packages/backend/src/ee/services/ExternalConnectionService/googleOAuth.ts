import {
    ApiConnectorType,
    WarehouseConnectionError,
    type ExternalConnectionApiSource,
    type GoogleLiveSourceChoice,
} from '@lightdash/common';
import { z } from 'zod';
import { GA4_DATA_ORIGIN } from '../../../services/QuerySourceService/api/google/Ga4Connector';
import {
    SEARCH_CONSOLE_ORIGIN,
    SEARCH_CONSOLE_SITES_PATH,
} from '../../../services/QuerySourceService/api/google/SearchConsoleConnector';

export const GOOGLE_AUTHORIZE_URL =
    'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

export type GoogleConnectorType =
    | ApiConnectorType.SEARCH_CONSOLE
    | ApiConnectorType.GA4;

const GA4_ACCOUNT_SUMMARIES_URL =
    'https://analyticsadmin.googleapis.com/v1beta/accountSummaries';
const GA4_ACCOUNT_SUMMARY_PAGES = 5;

/** Reads a Google API as the signed-in account; returns the status and parsed JSON body. */
export type GoogleApiGet = (
    url: string,
    accessToken: string,
) => Promise<{ status: number; body: unknown }>;

type GoogleConnectorConfig = {
    label: string;
    scope: string;
    origin: string;
    /** What the signed-in account can read, for the admin to pick one. */
    listChoices: (
        get: GoogleApiGet,
        accessToken: string,
    ) => Promise<GoogleLiveSourceChoice[]>;
    toApiSource: (choice: string) => ExternalConnectionApiSource;
    choiceOf: (apiSource: ExternalConnectionApiSource) => string | null;
};

const sitesSchema = z.object({
    siteEntry: z
        .array(z.object({ siteUrl: z.string(), permissionLevel: z.string() }))
        .optional(),
});

const accountSummariesSchema = z.object({
    accountSummaries: z
        .array(
            z.object({
                displayName: z.string().optional(),
                propertySummaries: z
                    .array(
                        z.object({
                            property: z.string(),
                            displayName: z.string().optional(),
                        }),
                    )
                    .optional(),
            }),
        )
        .optional(),
    nextPageToken: z.string().optional(),
});

const SITE_PERMISSION_LABELS: Record<string, string> = {
    siteOwner: 'Owner',
    siteFullUser: 'Full user',
    siteRestrictedUser: 'Restricted user',
};

const googleErrorSchema = z.object({
    error: z.object({ message: z.string() }),
});

const assertOk = (
    { status, body }: { status: number; body: unknown },
    label: string,
): void => {
    if (status < 200 || status >= 300) {
        const parsed = googleErrorSchema.safeParse(body);
        const detail = parsed.success
            ? ` Google said: ${parsed.data.error.message}`
            : '';
        throw new WarehouseConnectionError(
            `Could not list what the Google account can read in ${label} (status ${status}). Check that the ${label} API is enabled for this server's Google client.${detail}`,
        );
    }
};

export const GOOGLE_CONNECTORS: Record<
    GoogleConnectorType,
    GoogleConnectorConfig
> = {
    [ApiConnectorType.SEARCH_CONSOLE]: {
        label: 'Search Console',
        scope: 'https://www.googleapis.com/auth/webmasters.readonly',
        origin: SEARCH_CONSOLE_ORIGIN,
        listChoices: async (get, accessToken) => {
            const response = await get(
                `${SEARCH_CONSOLE_ORIGIN}${SEARCH_CONSOLE_SITES_PATH}`,
                accessToken,
            );
            assertOk(response, 'Search Console');
            const parsed = sitesSchema.safeParse(response.body);
            return (parsed.success ? (parsed.data.siteEntry ?? []) : [])
                .filter(({ permissionLevel }) =>
                    Object.hasOwn(SITE_PERMISSION_LABELS, permissionLevel),
                )
                .map(({ siteUrl, permissionLevel }) => ({
                    value: siteUrl,
                    label: siteUrl,
                    description: SITE_PERMISSION_LABELS[permissionLevel],
                }))
                .sort((a, b) => a.label.localeCompare(b.label));
        },
        toApiSource: (siteUrl) => ({
            connector: ApiConnectorType.SEARCH_CONSOLE,
            siteUrl,
        }),
        choiceOf: (apiSource) =>
            apiSource.connector === ApiConnectorType.SEARCH_CONSOLE
                ? apiSource.siteUrl
                : null,
    },
    [ApiConnectorType.GA4]: {
        label: 'Google Analytics',
        scope: 'https://www.googleapis.com/auth/analytics.readonly',
        origin: GA4_DATA_ORIGIN,
        listChoices: async (get, accessToken) => {
            const choices: GoogleLiveSourceChoice[] = [];
            let pageToken: string | undefined;
            for (let page = 0; page < GA4_ACCOUNT_SUMMARY_PAGES; page += 1) {
                const url = new URL(GA4_ACCOUNT_SUMMARIES_URL);
                url.searchParams.set('pageSize', '200');
                if (pageToken) url.searchParams.set('pageToken', pageToken);
                // eslint-disable-next-line no-await-in-loop
                const response = await get(url.href, accessToken);
                assertOk(response, 'Google Analytics Admin');
                const parsed = accountSummariesSchema.safeParse(response.body);
                if (!parsed.success) break;
                parsed.data.accountSummaries?.forEach((account) =>
                    account.propertySummaries?.forEach((property) => {
                        const propertyId = property.property.replace(
                            /^properties\//,
                            '',
                        );
                        choices.push({
                            value: propertyId,
                            label: property.displayName ?? property.property,
                            description: `${
                                account.displayName ?? 'Account'
                            } · property ${propertyId}`,
                        });
                    }),
                );
                pageToken = parsed.data.nextPageToken;
                if (!pageToken) break;
            }
            return choices.sort((a, b) => a.label.localeCompare(b.label));
        },
        toApiSource: (propertyId) => ({
            connector: ApiConnectorType.GA4,
            propertyId,
        }),
        choiceOf: (apiSource) =>
            apiSource.connector === ApiConnectorType.GA4
                ? apiSource.propertyId
                : null,
    },
};

export const isGoogleConnector = (
    connector: string,
): connector is GoogleConnectorType =>
    Object.hasOwn(GOOGLE_CONNECTORS, connector);

export const buildGoogleAuthorizeUrl = ({
    clientId,
    redirectUri,
    scope,
    state,
    codeChallenge,
}: {
    clientId: string;
    redirectUri: string;
    scope: string;
    state: string;
    codeChallenge: string;
}): string => {
    const url = new URL(GOOGLE_AUTHORIZE_URL);
    url.search = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: redirectUri,
        scope,
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        // A refresh token is only issued offline, and again only on consent.
        access_type: 'offline',
        prompt: 'consent',
    }).toString();
    return url.href;
};
