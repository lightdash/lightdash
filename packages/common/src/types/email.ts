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

/**
 * Verification status of an email address
 */
export type EmailStatus = {
    email: string;
    isVerified: boolean;
    /**
     * One time passcode information
     * If there is no active passcode, this will be undefined
     */
    otp?: EmailOneTimePassword;
};

/**
 * Shows the current verification status of an email address
 */
export type ApiEmailStatusResponse = {
    status: 'ok';
    results: EmailStatus;
};
