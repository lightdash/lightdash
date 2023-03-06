type EmailOneTimePassword = {
    /**
     * Time that the passcode was created
     */
    createdAt: Date;
    /**
     * Number of times the passcode has been attempted
     */
    numberOfAttempts: number;
};

type EmailOneTimePasswordExpiring = EmailOneTimePassword & {
    expiresAt: Date;
    isExpired: boolean;
    isMaxAttempts: boolean;
};

export type EmailStatus = {
    email: string;
    isVerified: boolean;
    otp?: EmailOneTimePassword;
};

/**
 * Verification status of an email address
 */
export type EmailStatusExpiring = EmailStatus & {
    /**
     * One time passcode information
     * If there is no active passcode, this will be undefined
     */
    otp?: EmailOneTimePasswordExpiring;
};

/**
 * Shows the current verification status of an email address
 */
export type ApiEmailStatusResponse = {
    status: 'ok';
    results: EmailStatusExpiring;
};
