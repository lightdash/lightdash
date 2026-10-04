export type AwsWebIdentityAudience = {
    /** Pinned as accounts.google.com:oaud in the role's trust policy. */
    audience: string;
};

export type ApiAwsWebIdentityAudienceResponse = {
    status: 'ok';
    results: AwsWebIdentityAudience;
};
