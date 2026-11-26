import { subject } from '@casl/ability';
import {
    assertIsAccountWithOrg,
    assertRegisteredAccount,
    ForbiddenError,
    LightdashMode,
    NotFoundError,
    ParameterError,
    SecurityContactsResponseSchema,
    UnexpectedServerError,
    UpdateSecurityContactsRequestSchema,
    type Account,
    type SecurityContactsResults,
} from '@lightdash/common';
import type { LightdashConfig } from '../../../config/parseConfig';
import { BaseService } from '../../../services/BaseService';

const REQUEST_TIMEOUT_MS = 15_000;
// Self-hosted instances only; development mode is for local testing.
const SECURITY_CONTACTS_MODES: LightdashMode[] = [
    LightdashMode.DEFAULT,
    LightdashMode.DEV,
];
const UNAVAILABLE_MESSAGE = 'Security contacts are not available';
const NOT_CONFIGURED_MESSAGE =
    'Security contacts are not set up for this license';
const FAILURE_MESSAGE =
    'Could not reach the security contacts service. Please try again.';

type Dependencies = {
    lightdashConfig: LightdashConfig;
};

export class SecurityContactsService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    constructor({ lightdashConfig }: Dependencies) {
        super();
        this.lightdashConfig = lightdashConfig;
    }

    async getContacts(account: Account): Promise<SecurityContactsResults> {
        return this.request(this.authorize(account), 'GET');
    }

    async updateContacts(
        account: Account,
        body: unknown,
    ): Promise<SecurityContactsResults> {
        const licenseKey = this.authorize(account);
        const parsed = UpdateSecurityContactsRequestSchema.safeParse(body);
        if (!parsed.success) {
            throw new ParameterError(
                'Enter up to 10 valid email addresses for security contacts',
            );
        }
        return this.request(licenseKey, 'PUT', parsed.data);
    }

    /** Returns the instance license key once the caller may manage contacts. */
    private authorize(account: Account): string {
        assertRegisteredAccount(account);
        assertIsAccountWithOrg(account);
        const { organizationUuid } = account.organization;

        if (
            this.createAuditedAbility(account).cannot(
                'manage',
                subject('Organization', { organizationUuid }),
            )
        ) {
            throw new ForbiddenError(
                'You do not have permission to manage security contacts for this organization',
            );
        }

        const { licenseKey } = this.lightdashConfig.license;
        if (
            !SECURITY_CONTACTS_MODES.includes(this.lightdashConfig.mode) ||
            !licenseKey
        ) {
            throw new ForbiddenError(UNAVAILABLE_MESSAGE);
        }
        return licenseKey;
    }

    private async request(
        licenseKey: string,
        method: 'GET' | 'PUT',
        body?: { emails: string[] },
    ): Promise<SecurityContactsResults> {
        // Control Center serves security contacts from the same origin as the
        // roadmap. Contacts belong to the license, so no organization is sent.
        const url = new URL(
            '/api/v1/security/contacts',
            this.lightdashConfig.roadmap.baseUrl,
        );

        let response: Response;
        try {
            response = await fetch(url.toString(), {
                method,
                redirect: 'manual',
                headers: {
                    'lightdash-license-key': licenseKey,
                    ...(body ? { 'content-type': 'application/json' } : {}),
                },
                ...(body ? { body: JSON.stringify(body) } : {}),
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            });
        } catch (error) {
            this.logger.warn('Could not reach the security contacts service', {
                errorName: error instanceof Error ? error.name : 'UnknownError',
            });
            throw new UnexpectedServerError(FAILURE_MESSAGE);
        }

        if (response.status === 401 || response.status === 403) {
            this.logger.warn('Security contacts service denied the request', {
                statusCode: response.status,
            });
            throw new ForbiddenError(UNAVAILABLE_MESSAGE);
        }
        // No customer record carries this instance's license yet.
        if (response.status === 404) {
            throw new NotFoundError(NOT_CONFIGURED_MESSAGE);
        }
        if (response.status === 400) {
            throw new ParameterError(
                'Enter up to 10 valid email addresses for security contacts',
            );
        }
        if (response.status !== 200) {
            this.logger.warn('Security contacts service returned an error', {
                statusCode: response.status,
            });
            throw new UnexpectedServerError(FAILURE_MESSAGE);
        }

        let payload: unknown;
        try {
            payload = await response.json();
        } catch {
            throw new UnexpectedServerError(FAILURE_MESSAGE);
        }

        const parsed = SecurityContactsResponseSchema.safeParse(payload);
        if (!parsed.success) {
            this.logger.warn(
                'Security contacts service returned an invalid response',
            );
            throw new UnexpectedServerError(FAILURE_MESSAGE);
        }
        return parsed.data.results;
    }
}
