/**
 * Email whitelabelling (cloud-only).
 *
 * Lets an organization send report/notification emails from their own domain
 * (e.g. `reports@customer.com`) instead of the Lightdash address. Sending stays
 * over SMTP; what these types describe is the control plane that provisions
 * domain authentication (DKIM + return-path) via the email provider (Postmark),
 * hands the customer the DNS records to add, and tracks verification state.
 */

/**
 * A single DNS record the customer must add at their DNS provider. Values are
 * always the real, per-domain values returned by the provider — never a
 * templated example.
 */
export type EmailDnsRecord = {
    purpose: 'dkim' | 'return-path';
    type: 'TXT' | 'CNAME';
    /** The host / name of the record (left-hand side). */
    name: string;
    /** The value the record must resolve to (right-hand side). */
    value: string;
    verified: boolean;
};

/**
 * Lifecycle of an organization's sending domain.
 *
 * - `pending` — records handed over, waiting on DNS to propagate & verify.
 * - `verified` — both DKIM and return-path verified, ready to enable.
 * - `enabled` — verified and turned on; report emails send from this domain.
 * - `failed` — verification did not complete within the timeout window; the
 *   admin can re-check to restart.
 */
export type EmailWhitelabelStatus =
    | 'pending'
    | 'verified'
    | 'enabled'
    | 'failed';

/**
 * The full sender-identity configuration for an organization, as returned to
 * the setup UI. `null` from the API means the org has not started setup.
 */
export type OrganizationEmailWhitelabel = {
    organizationUuid: string;
    /** Domain (or subdomain) emails are sent from, e.g. `reports.customer.com`. */
    domain: string;
    /** The address emails are sent from, e.g. `reports@customer.com`. */
    fromEmail: string;
    /** Display name shown in the From header, or null to use the Lightdash default. */
    fromName: string | null;
    status: EmailWhitelabelStatus;
    dkimVerified: boolean;
    returnPathVerified: boolean;
    /** Both DKIM and return-path verified — required before enabling. */
    isVerified: boolean;
    isEnabled: boolean;
    dnsRecords: EmailDnsRecord[];
    /** Last time the provider was polled for verification, null if never. */
    lastCheckedAt: Date | null;
    createdAt: Date;
};

/**
 * Create (or replace) the org's sending domain. Suggest a subdomain like
 * `reports.customer.com` in the UI to keep it isolated from the customer's
 * primary mail reputation.
 */
export type CreateEmailWhitelabel = {
    domain: string;
    fromEmail: string;
    fromName?: string | null;
};

/** Toggle sending on/off. Can only be enabled once fully verified. */
export type UpdateEmailWhitelabel = {
    isEnabled: boolean;
};

export type ApiEmailWhitelabelResponse = {
    status: 'ok';
    results: OrganizationEmailWhitelabel | null;
};

/**
 * The sender fields to apply when sending an organization's email, resolved at
 * send time. `from` is null when the instance default From should be used
 * (e.g. while setup is still pending, we keep the Lightdash identity and only
 * set `replyTo` to the customer's address).
 */
export type EmailSenderIdentity = {
    from: string | null;
    replyTo: string | null;
};
