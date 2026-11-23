import {
    getLiveSourceSignInSentence,
    isLiveSourceSignInRequired,
} from '@lightdash/common';

export type QueryError =
    | { name?: string; message?: string; data?: unknown }
    | null
    | undefined;

export const getLiveSourceSignIn = (error: QueryError) =>
    error?.name === 'LiveSourceSignInRequiredError' &&
    error.data &&
    typeof error.data === 'object' &&
    isLiveSourceSignInRequired(error.data)
        ? error.data.signIn
        : null;

/**
 * What to show for a query error: a missing sign-in reads as one sentence,
 * since the button below it holds the link the message carries.
 */
export const getQueryErrorText = (error: QueryError): string | undefined => {
    const signIn = getLiveSourceSignIn(error);
    return signIn ? getLiveSourceSignInSentence(signIn) : error?.message;
};
