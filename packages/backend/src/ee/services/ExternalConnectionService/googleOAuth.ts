import {
    ApiConnectorType,
    WarehouseConnectionError,
    type ExternalConnectionApiSource,
    type GoogleLiveSourceChoice,
} from '@lightdash/common';
import { z } from 'zod';
import { GA4_DATA_ORIGIN } from '../../../services/QuerySourceService/api/google/Ga4Connector';
import {
    getGoogleAdsSearchPath,
    GOOGLE_ADS_LIST_CUSTOMERS_PATH,
    GOOGLE_ADS_ORIGIN,
} from '../../../services/QuerySourceService/api/google/GoogleAdsConnector';
import {
    SEARCH_CONSOLE_ORIGIN,
    SEARCH_CONSOLE_SITES_PATH,
} from '../../../services/QuerySourceService/api/google/SearchConsoleConnector';

export const GOOGLE_AUTHORIZE_URL =
    'https://accounts.google.com/o/oauth2/v2/auth';

export type GoogleConnectorType =
    | ApiConnectorType.SEARCH_CONSOLE
    | ApiConnectorType.GA4
    | ApiConnectorType.GOOGLE_ADS;

const GA4_ACCOUNT_SUMMARIES_URL =
    'https://analyticsadmin.googleapis.com/v1beta/accountSummaries';
const GA4_ACCOUNT_SUMMARY_PAGES = 5;

/** Reads a Google API as the signed-in account; returns the status and parsed JSON body. */
export type GoogleApiGet = (
    url: string,
    accessToken: string,
) => Promise<{ status: number; body: unknown }>;

/** Posts JSON to a Google API as the signed-in account. */
export type GoogleApiPost = (
    url: string,
    accessToken: string,
    body: unknown,
    headers: Record<string, string>,
) => Promise<{ status: number; body: unknown }>;

export type GoogleApi = { get: GoogleApiGet; post: GoogleApiPost };

type GoogleConnectorConfig = {
    label: string;
    scope: string;
    origin: string;
    /** What the signed-in account can read, for the admin to pick one. */
    listChoices: (
        api: GoogleApi,
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

const accessibleCustomersSchema = z.object({
    resourceNames: z.array(z.string()).optional(),
});

const customerClientsSchema = z.object({
    results: z
        .array(
            z.object({
                customerClient: z.object({
                    id: z.string(),
                    descriptiveName: z.string().optional(),
                    currencyCode: z.string().optional(),
                    status: z.string().optional(),
                }),
            }),
        )
        .optional(),
});

const GOOGLE_ADS_MAX_ROOT_CUSTOMERS = 50;
// Metrics can only be read from client accounts, never from a manager
const GOOGLE_ADS_CUSTOMER_CLIENTS_QUERY =
    'SELECT customer_client.id, customer_client.descriptive_name, customer_client.currency_code, customer_client.status FROM customer_client WHERE customer_client.manager = FALSE LIMIT 1000';

const formatGoogleAdsCustomerId = (id: string) =>
    id.length === 10
        ? `${id.slice(0, 3)}-${id.slice(3, 6)}-${id.slice(6)}`
        : id;

/**
 * Every client account the sign-in reaches, directly or through a manager
 * account. Each root costs one Google Ads operation.
 */
const listGoogleAdsChoices = async (
    { get, post }: GoogleApi,
    accessToken: string,
): Promise<GoogleLiveSourceChoice[]> => {
    const listed = await get(
        `${GOOGLE_ADS_ORIGIN}${GOOGLE_ADS_LIST_CUSTOMERS_PATH}`,
        accessToken,
    );
    assertOk(listed, 'Google Ads');
    const rootIds = (
        accessibleCustomersSchema.safeParse(listed.body).data?.resourceNames ??
        []
    )
        .map((name) => name.replace(/^customers\//, ''))
        .slice(0, GOOGLE_ADS_MAX_ROOT_CUSTOMERS);
    const responses = await Promise.all(
        rootIds.map(async (rootId) => ({
            rootId,
            response: await post(
                `${GOOGLE_ADS_ORIGIN}${getGoogleAdsSearchPath(rootId)}`,
                accessToken,
                { query: GOOGLE_ADS_CUSTOMER_CLIENTS_QUERY },
                { 'login-customer-id': rootId },
            ),
        })),
    );
    const isOk = (status: number) => status >= 200 && status < 300;
    // One closed account shouldn't hide the others; all of them failing is
    // an access problem the admin needs to see.
    const firstFailure = responses.find(
        ({ response }) => !isOk(response.status),
    );
    if (
        firstFailure &&
        !responses.some(({ response }) => isOk(response.status))
    ) {
        assertOk(firstFailure.response, 'Google Ads');
    }
    const choices = new Map<string, GoogleLiveSourceChoice>();
    responses
        .filter(({ response }) => isOk(response.status))
        .forEach(({ rootId, response }) => {
            customerClientsSchema
                .safeParse(response.body)
                .data?.results?.forEach(({ customerClient }) => {
                    const { id, descriptiveName, currencyCode, status } =
                        customerClient;
                    const viaManager = id !== rootId;
                    const value = viaManager ? `${rootId}/${id}` : id;
                    const description = [
                        formatGoogleAdsCustomerId(id),
                        currencyCode,
                        viaManager &&
                            `via manager ${formatGoogleAdsCustomerId(rootId)}`,
                        status !== 'ENABLED' && status,
                    ]
                        .filter(Boolean)
                        .join(' · ');
                    choices.set(value, {
                        value,
                        label:
                            descriptiveName ||
                            `Account ${formatGoogleAdsCustomerId(id)}`,
                        description,
                    });
                });
        });
    return [...choices.values()].sort((a, b) => a.label.localeCompare(b.label));
};

export const GOOGLE_CONNECTORS: Record<
    GoogleConnectorType,
    GoogleConnectorConfig
> = {
    [ApiConnectorType.SEARCH_CONSOLE]: {
        label: 'Search Console',
        scope: 'https://www.googleapis.com/auth/webmasters.readonly',
        origin: SEARCH_CONSOLE_ORIGIN,
        listChoices: async ({ get }, accessToken) => {
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
        listChoices: async ({ get }, accessToken) => {
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
    [ApiConnectorType.GOOGLE_ADS]: {
        label: 'Google Ads',
        scope: 'https://www.googleapis.com/auth/adwords',
        origin: GOOGLE_ADS_ORIGIN,
        listChoices: listGoogleAdsChoices,
        toApiSource: (choice) => {
            const [first, second] = choice.split('/');
            return {
                connector: ApiConnectorType.GOOGLE_ADS,
                customerId: second ?? first,
                loginCustomerId: second === undefined ? null : first,
            };
        },
        choiceOf: (apiSource) => {
            if (apiSource.connector !== ApiConnectorType.GOOGLE_ADS) {
                return null;
            }
            const { customerId, loginCustomerId } = apiSource;
            return loginCustomerId
                ? `${loginCustomerId}/${customerId}`
                : customerId;
        },
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
