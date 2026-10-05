import { fromWebToken } from '@aws-sdk/credential-providers';
import {
    getErrorMessage,
    ParameterError,
    usesAwsWebIdentity,
    WarehouseConnectionError,
    WarehouseTypes,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import { randomBytes } from 'crypto';
import { type AwsWebIdentityAudienceModel } from '../../models/AwsWebIdentityAudienceModel';
import {
    getIdTokenSubject,
    type GoogleIdentityTokenSource,
} from './googleIdentityTokenSource';
import { AWS_WEB_IDENTITY_MESSAGES } from './messages';

export type AwsCredentialProvider = ReturnType<typeof fromWebToken>;

// AWS limits role session names to 64 characters.
const MAX_ROLE_SESSION_NAME_LENGTH = 64;
// A fixed audience used only to read this instance's subject.
const SUBJECT_LOOKUP_AUDIENCE = 'lightdash-subject-lookup';

const toRoleSessionName = (name: string) =>
    name.replace(/[^\w+=,.@-]/g, '-').slice(0, MAX_ROLE_SESSION_NAME_LENGTH);

const isAccessDenied = (e: unknown) =>
    e instanceof Error &&
    (e.name === 'AccessDenied' || e.name === 'AccessDeniedException');

/** A provider that fails with `message` whenever credentials are needed. */
export const failingAwsCredentialProvider =
    (message: string): AwsCredentialProvider =>
    async () => {
        throw new WarehouseConnectionError(message);
    };

type WebIdentityConnection = {
    roleArn: string;
    region: string;
    audience: string | undefined;
};

const getWebIdentityConnection = (
    credentials: CreateWarehouseCredentials | undefined,
): WebIdentityConnection | undefined =>
    credentials?.type === WarehouseTypes.ATHENA &&
    usesAwsWebIdentity(credentials)
        ? {
              roleArn: credentials.assumeRoleArn ?? '',
              region: credentials.region,
              audience: credentials.webIdentityAudience,
          }
        : undefined;

/**
 * Turns web identity connection settings into AWS credentials for this
 * instance's Google identity. An audience is only used for the organization
 * it was generated for, so a connection can't use another organization's
 * audience, however its credentials were written.
 */
export class AwsWebIdentityResolver {
    private readonly isEnabledFor: (
        organizationUuid: string,
    ) => Promise<boolean>;

    private readonly audienceModel: AwsWebIdentityAudienceModel;

    private readonly tokenSource: GoogleIdentityTokenSource;

    private subject: Promise<string | undefined> | undefined;

    constructor(args: {
        isEnabledFor: (organizationUuid: string) => Promise<boolean>;
        audienceModel: AwsWebIdentityAudienceModel;
        tokenSource: GoogleIdentityTokenSource;
    }) {
        this.isEnabledFor = args.isEnabledFor;
        this.audienceModel = args.audienceModel;
        this.tokenSource = args.tokenSource;
    }

    /** This instance's Google subject, or undefined when it isn't available. */
    async getSubject(): Promise<string | undefined> {
        if (!this.subject) {
            this.subject = this.tokenSource
                .getIdToken(SUBJECT_LOOKUP_AUDIENCE)
                .then(getIdTokenSubject)
                .catch(() => undefined);
        }
        const subject = await this.subject;
        // Retry a failed lookup next time.
        if (subject === undefined) this.subject = undefined;
        return subject;
    }

    /** Throws when the audience wasn't generated for `organizationUuid`. */
    async assertAudienceBelongsTo(
        credentials: CreateWarehouseCredentials | undefined,
        organizationUuid: string,
    ): Promise<void> {
        const connection = getWebIdentityConnection(credentials);
        if (!connection) return;
        if (!(await this.isEnabledFor(organizationUuid))) {
            throw new ParameterError(AWS_WEB_IDENTITY_MESSAGES.notEnabled);
        }
        if (!connection.audience) {
            throw new ParameterError(AWS_WEB_IDENTITY_MESSAGES.missingAudience);
        }
        const owner = await this.audienceModel.getOrganizationUuid(
            connection.audience,
        );
        if (owner !== organizationUuid) {
            throw new ParameterError(AWS_WEB_IDENTITY_MESSAGES.invalidAudience);
        }
    }

    /**
     * AWS credentials for a web identity connection owned by
     * `organizationUuid`, or a provider that explains why there are none.
     * Returns undefined for other authentication types.
     */
    async resolveCredentials(
        credentials: CreateWarehouseCredentials | undefined,
        organizationUuid: string | undefined,
    ): Promise<AwsCredentialProvider | undefined> {
        const connection = getWebIdentityConnection(credentials);
        if (!connection) return undefined;
        if (!organizationUuid) {
            return failingAwsCredentialProvider(
                AWS_WEB_IDENTITY_MESSAGES.invalidAudience,
            );
        }
        try {
            await this.assertAudienceBelongsTo(credentials, organizationUuid);
        } catch (e) {
            return failingAwsCredentialProvider(getErrorMessage(e));
        }
        if (!connection.roleArn) {
            return failingAwsCredentialProvider(
                AWS_WEB_IDENTITY_MESSAGES.missingRoleArn,
            );
        }
        const audience = connection.audience!;
        return async () => {
            const webIdentityToken =
                await this.tokenSource.getIdToken(audience);
            try {
                return await fromWebToken({
                    roleArn: connection.roleArn,
                    webIdentityToken,
                    roleSessionName: toRoleSessionName(
                        `lightdash-${organizationUuid}`,
                    ),
                    clientConfig: { region: connection.region },
                })();
            } catch (e) {
                if (isAccessDenied(e)) {
                    throw new WarehouseConnectionError(
                        AWS_WEB_IDENTITY_MESSAGES.accessDenied(
                            connection.roleArn,
                            audience,
                            await this.getSubject(),
                        ),
                    );
                }
                throw new WarehouseConnectionError(
                    `Couldn't assume ${connection.roleArn} with web identity. ${getErrorMessage(e)}`,
                );
            }
        };
    }

    /**
     * Throws when the role accepts a token for an audience Lightdash never
     * issued, which means its trust policy doesn't pin
     * accounts.google.com:oaud and any organization could use it.
     */
    async assertRoleRequiresAudience(
        credentials: CreateWarehouseCredentials | undefined,
    ): Promise<void> {
        const connection = getWebIdentityConnection(credentials);
        if (!connection?.roleArn) return;
        const probeAudience = `lightdash-probe-${randomBytes(16).toString('hex')}`;
        let webIdentityToken: string;
        try {
            webIdentityToken = await this.tokenSource.getIdToken(probeAudience);
        } catch {
            // The connection test itself reports the token problem.
            return;
        }
        try {
            await fromWebToken({
                roleArn: connection.roleArn,
                webIdentityToken,
                roleSessionName: 'lightdash-trust-policy-check',
                clientConfig: { region: connection.region },
            })();
        } catch {
            // Refused, as it should be.
            return;
        }
        throw new ParameterError(
            AWS_WEB_IDENTITY_MESSAGES.audienceNotPinned(connection.roleArn),
        );
    }
}
