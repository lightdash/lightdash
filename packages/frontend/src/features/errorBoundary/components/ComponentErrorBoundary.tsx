import * as Sentry from '@sentry/react';
import React, { type FC, type PropsWithChildren } from 'react';
import { ErrorBoundaryMessage } from './ErrorBoundaryMessage';

export const ComponentErrorBoundary: FC<PropsWithChildren> = ({ children }) => {
    return (
        <Sentry.ErrorBoundary
            fallback={({ eventId, error }) => (
                <ErrorBoundaryMessage eventId={eventId} error={error} />
            )}
        >
            {children}
        </Sentry.ErrorBoundary>
    );
};
