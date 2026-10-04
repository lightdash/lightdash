export const AWS_WEB_IDENTITY_MESSAGES = {
    notEnabled:
        "Web identity isn't turned on for this Lightdash instance. Choose another authentication type, or contact support.",
    invalidAudience:
        "This connection's audience isn't valid for your organization. Generate a new audience, then update the role's trust policy.",
    missingAudience: 'Generate an audience to continue.',
    missingRoleArn: 'Add an IAM role ARN in the connection settings.',
    invalidRoleArn:
        'Enter a role ARN, like arn:aws:iam::123456789012:role/lightdash-athena',
    tokenUnavailable:
        "Lightdash couldn't get its identity token. This is on our side, not your AWS setup. Try again, or contact support.",
    accessDenied: (roleArn: string, audience: string, subject?: string) =>
        subject
            ? `AWS didn't allow Lightdash to use ${roleArn}. Check that the role's trust policy includes subject ${subject} and audience ${audience}.`
            : `AWS didn't allow Lightdash to use ${roleArn}. Check that the role's trust policy includes audience ${audience}.`,
    audienceNotPinned: (roleArn: string) =>
        `The trust policy for ${roleArn} doesn't require accounts.google.com:oaud, so other Lightdash organizations could use the role. Add the audience condition from the connection settings, then try again.`,
} as const;
