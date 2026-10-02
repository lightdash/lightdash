import type { ReactNode } from 'react';
import { useIsPersonalSignInExpired } from '../../hooks/useIsPersonalSignInExpired';
import { SignInExpiredState } from './SignInExpiredState';

type QueryErrorStateProps = {
    isExpiredSignIn: boolean;
    details: string | undefined;
    children: ReactNode;
};

export const QueryErrorState = ({
    isExpiredSignIn,
    details,
    children,
}: QueryErrorStateProps) =>
    isExpiredSignIn ? <SignInExpiredState details={details ?? ''} /> : children;

export const QueryErrorMessageState = ({
    message,
    children,
}: {
    message: string | undefined;
    children: ReactNode;
}) => {
    const isExpiredSignIn = useIsPersonalSignInExpired(message);
    return (
        <QueryErrorState isExpiredSignIn={isExpiredSignIn} details={message}>
            {children}
        </QueryErrorState>
    );
};
