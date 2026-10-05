const AWS_IAM_ROLE_ARN_PATTERN =
    /^arn:aws[a-z-]*:iam::\d{12}:role\/[\w+=,.@/-]+$/;

export const isAwsIamRoleArn = (value: string) =>
    AWS_IAM_ROLE_ARN_PATTERN.test(value);

export const AWS_IAM_ROLE_ARN_INVALID_MESSAGE =
    'Enter a role ARN, like arn:aws:iam::123456789012:role/lightdash-athena';

export const AWS_WEB_IDENTITY_NOT_ENABLED_MESSAGE =
    "Web identity isn't turned on for this Lightdash instance. Choose another authentication type, or contact support.";
