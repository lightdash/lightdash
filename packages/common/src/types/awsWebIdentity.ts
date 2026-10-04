export type AwsWebIdentity = {
    /**
     * This instance's Google subject, pinned as accounts.google.com:sub and
     * accounts.google.com:aud. Null when the instance can't read it.
     */
    subject: string | null;
};

export type AwsWebIdentityAudience = AwsWebIdentity & {
    /** Pinned as accounts.google.com:oaud in the role's trust policy. */
    audience: string;
};

export type ApiAwsWebIdentityAudienceResponse = {
    status: 'ok';
    results: AwsWebIdentityAudience;
};

export type ApiAwsWebIdentityResponse = {
    status: 'ok';
    results: AwsWebIdentity;
};
