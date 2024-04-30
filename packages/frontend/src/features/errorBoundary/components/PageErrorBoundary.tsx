import * as Sentry from '@sentry/react';
import React, { type FC, type PropsWithChildren } from 'react';
import { ErrorBoundaryMessage } from './ErrorBoundaryMessage';

export const PageErrorBoundary: FC<PropsWithChildren> = ({ children }) => {
    return (
        <Sentry.ErrorBoundary
            fallback={({ eventId, error }) => (
                <ErrorBoundaryMessage
                    eventId={eventId}
                    error={error}
                    wrapper={{ mt: '4xl' }}
                />
            )}
        >
            {children}
        </Sentry.ErrorBoundary>
    );
};
