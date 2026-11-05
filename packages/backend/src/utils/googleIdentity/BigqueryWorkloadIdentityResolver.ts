import {
    getBigqueryWorkloadIdentityStsAudience,
    getBigqueryWorkloadIdentityTokenAudience,
    isBigqueryWorkloadIdentityAudience,
    isBigqueryWorkloadIdentityProvider,
    ParameterError,
    usesBigqueryWorkloadIdentity,
    WarehouseConnectionError,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import type { BigqueryExternalAccountCredentials } from '@lightdash/warehouses';
import Logger from '../../logging/logger';
import { createGoogleIdentitySubjectGetter } from './googleIdentitySubject';
import {
    getIdTokenExpiry,
    GOOGLE_IDENTITY_TOKEN_UNAVAILABLE,
    type GoogleIdentityTokenSource,
} from './googleIdentityTokenSource';
import { BIGQUERY_WORKLOAD_IDENTITY_NOT_ENABLED } from './messages';

const TOKEN_REFRESH_MARGIN_MS = 5 * 60_000;

export class BigqueryWorkloadIdentityResolver {
    readonly getSubject: () => Promise<string | undefined>;

    constructor(
        private readonly dependencies: {
            isEnabledFor: (organizationUuid: string) => Promise<boolean>;
            tokenSource: GoogleIdentityTokenSource;
        },
    ) {
        this.getSubject = createGoogleIdentitySubjectGetter(
            dependencies.tokenSource,
        );
    }

    async assertAllowedFor(
        credentials: CreateWarehouseCredentials | undefined,
        organizationUuid: string,
    ): Promise<void> {
        if (!usesBigqueryWorkloadIdentity(credentials)) return;
        if (!(await this.dependencies.isEnabledFor(organizationUuid))) {
            throw new ParameterError(BIGQUERY_WORKLOAD_IDENTITY_NOT_ENABLED);
        }
        if (
            !credentials.workloadIdentityProvider ||
            !isBigqueryWorkloadIdentityProvider(
                credentials.workloadIdentityProvider,
            )
        ) {
            throw new ParameterError(
                'Enter a valid BigQuery workload identity provider resource name.',
            );
        }
        if (
            credentials.workloadIdentityAudience !== undefined &&
            !isBigqueryWorkloadIdentityAudience(
                credentials.workloadIdentityAudience,
            )
        ) {
            throw new ParameterError(
                'The BigQuery workload identity audience must be 1–256 characters without whitespace.',
            );
        }
    }

    async getExternalAccountCredentials(
        credentials: CreateWarehouseCredentials | undefined,
        organizationUuid: string | undefined,
    ): Promise<BigqueryExternalAccountCredentials | undefined> {
        if (!usesBigqueryWorkloadIdentity(credentials)) return undefined;
        if (!organizationUuid) {
            throw new WarehouseConnectionError(
                'An organization is required to use BigQuery workload identity federation.',
            );
        }
        try {
            await this.assertAllowedFor(credentials, organizationUuid);
        } catch (error) {
            if (error instanceof ParameterError) {
                throw new WarehouseConnectionError(error.message);
            }
            throw error;
        }
        const audience = getBigqueryWorkloadIdentityTokenAudience(credentials);
        let cachedToken: { token: string; expiresAt: number } | undefined;
        let pendingToken: Promise<string> | undefined;
        const refreshToken = async () => {
            let token: string;
            try {
                token =
                    await this.dependencies.tokenSource.getIdToken(audience);
            } catch {
                throw new WarehouseConnectionError(
                    GOOGLE_IDENTITY_TOKEN_UNAVAILABLE,
                );
            }
            const expiry = getIdTokenExpiry(token);
            const expiresAt = expiry === undefined ? undefined : expiry * 1000;
            if (expiresAt === undefined || expiresAt <= Date.now()) {
                Logger.warn(
                    'The GCP metadata server returned an unusable identity token',
                );
                throw new WarehouseConnectionError(
                    GOOGLE_IDENTITY_TOKEN_UNAVAILABLE,
                );
            }
            cachedToken = { token, expiresAt };
            return token;
        };
        return {
            type: 'external_account',
            audience: getBigqueryWorkloadIdentityStsAudience(credentials),
            subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
            token_url: 'https://sts.googleapis.com/v1/token',
            subject_token_supplier: {
                getSubjectToken: async () => {
                    if (
                        !(await this.dependencies.isEnabledFor(
                            organizationUuid,
                        ))
                    ) {
                        throw new WarehouseConnectionError(
                            BIGQUERY_WORKLOAD_IDENTITY_NOT_ENABLED,
                        );
                    }
                    if (
                        cachedToken &&
                        cachedToken.expiresAt - TOKEN_REFRESH_MARGIN_MS >
                            Date.now()
                    )
                        return cachedToken.token;
                    pendingToken ??= refreshToken().finally(() => {
                        pendingToken = undefined;
                    });
                    return pendingToken;
                },
            },
        };
    }
}
