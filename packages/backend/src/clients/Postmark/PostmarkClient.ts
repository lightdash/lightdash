import { getErrorMessage, UnexpectedServerError } from '@lightdash/common';
import Logger from '../../logging/logger';

const POSTMARK_API_BASE = 'https://api.postmarkapp.com';

/**
 * Subset of Postmark's Domain object we rely on.
 * https://postmarkapp.com/developer/api/domains-api
 */
export type PostmarkDomain = {
    ID: number;
    Name: string;
    DKIMVerified: boolean;
    /** DKIM host once verified; empty while pending. */
    DKIMHost: string;
    DKIMTextValue: string;
    /** DKIM host/value to publish while a rotation/setup is pending. */
    DKIMPendingHost: string;
    DKIMPendingTextValue: string;
    ReturnPathDomain: string;
    ReturnPathDomainVerified: boolean;
    ReturnPathDomainCNAMEValue: string;
};

/**
 * Thin client over the Postmark Domains API, used to provision per-organization
 * sender identities for email whitelabelling. Authenticated with the Postmark
 * account token (not a server token) since domain auth is account-scoped.
 *
 * Sending itself does not go through this client — it stays on the existing
 * SMTP path. This is purely the control plane: create a domain, read its
 * DKIM/return-path DNS records, and trigger verification.
 */
export class PostmarkClient {
    private readonly accountToken: string;

    constructor({ accountToken }: { accountToken: string }) {
        this.accountToken = accountToken;
    }

    private async request<T>(
        method: 'GET' | 'POST' | 'PUT' | 'DELETE',
        path: string,
        body?: Record<string, unknown>,
    ): Promise<T> {
        let response: Response;
        try {
            response = await fetch(`${POSTMARK_API_BASE}${path}`, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    'X-Postmark-Account-Token': this.accountToken,
                },
                body: body ? JSON.stringify(body) : undefined,
            });
        } catch (error) {
            Logger.error(`Postmark request failed: ${getErrorMessage(error)}`);
            throw new UnexpectedServerError(
                `Failed to reach the email provider. ${getErrorMessage(error)}`,
            );
        }

        const json = (await response.json().catch(() => ({}))) as T & {
            Message?: string;
            ErrorCode?: number;
        };

        if (!response.ok) {
            const message = json.Message || `HTTP ${response.status}`;
            Logger.error(
                `Postmark ${method} ${path} error (${response.status}): ${message}`,
            );
            throw new UnexpectedServerError(`Email provider error: ${message}`);
        }

        return json;
    }

    /**
     * Creates a sender domain with a custom return-path subdomain. If the
     * domain already exists on the account, callers should fall back to
     * {@link getDomainByName}.
     */
    async createDomain(
        domain: string,
        returnPathSubdomain: string,
    ): Promise<PostmarkDomain> {
        return this.request<PostmarkDomain>('POST', '/domains', {
            Name: domain,
            ReturnPathDomain: `${returnPathSubdomain}.${domain}`,
        });
    }

    async getDomain(postmarkDomainId: number): Promise<PostmarkDomain> {
        return this.request<PostmarkDomain>(
            'GET',
            `/domains/${postmarkDomainId}`,
        );
    }

    /**
     * Finds an existing domain by name (Postmark rejects duplicate domain
     * creation, so we look it up and reuse it).
     */
    async getDomainByName(domain: string): Promise<PostmarkDomain | undefined> {
        const { Domains } = await this.request<{
            Domains: Array<{ ID: number; Name: string }>;
        }>('GET', '/domains?count=500&offset=0');
        const match = Domains.find(
            (d) => d.Name.toLowerCase() === domain.toLowerCase(),
        );
        if (!match) return undefined;
        return this.getDomain(match.ID);
    }

    /** Triggers a DKIM DNS check. Returns the refreshed domain. */
    async verifyDkim(postmarkDomainId: number): Promise<PostmarkDomain> {
        return this.request<PostmarkDomain>(
            'PUT',
            `/domains/${postmarkDomainId}/verifyDkim`,
        );
    }

    /** Triggers a return-path DNS check. Returns the refreshed domain. */
    async verifyReturnPath(postmarkDomainId: number): Promise<PostmarkDomain> {
        return this.request<PostmarkDomain>(
            'PUT',
            `/domains/${postmarkDomainId}/verifyReturnPath`,
        );
    }

    async deleteDomain(postmarkDomainId: number): Promise<void> {
        await this.request('DELETE', `/domains/${postmarkDomainId}`);
    }
}
