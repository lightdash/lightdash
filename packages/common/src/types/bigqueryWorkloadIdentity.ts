export type BigqueryWorkloadIdentity = {
    issuer: 'https://accounts.google.com';
    /** This instance's Google subject. Null when it can't be read. */
    subject: string | null;
};

export type ApiBigqueryWorkloadIdentityResponse = {
    status: 'ok';
    results: BigqueryWorkloadIdentity;
};
