import {
    LiveSourceSignInRequiredError,
    type LiveSourceSignInRequired,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import { type ReactElement } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { getAsyncQueryError } from '../../hooks/useQueryResults';
import { renderWithProviders } from '../../testing/testUtils';
import { ConnectLiveSourceAction } from './ConnectLiveSourceAction';
import { getQueryErrorText } from './liveSourceSignInError';

const signIn = (
    reason: LiveSourceSignInRequired['reason'],
): LiveSourceSignInRequired => ({
    externalConnectionUuid: 'c-1',
    name: 'Events',
    integration: 'Hydra',
    reason,
    connectUrl:
        'https://app.example.com/api/v1/ee/projects/p-1/live-sources/c-1/user-sign-in/start',
});

const renderAt = (ui: ReactElement, path = '/') =>
    renderWithProviders(
        <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>,
    );

const toDetail = (error: LiveSourceSignInRequiredError) => ({
    name: error.name,
    message: error.message,
    data: error.data,
});

describe('ConnectLiveSourceAction', () => {
    it('links to the sign-in and back to this page', () => {
        renderAt(
            <ConnectLiveSourceAction
                error={toDetail(
                    new LiveSourceSignInRequiredError(signIn('missing')),
                )}
            />,
            '/projects/p-1/saved/chart?tab=1',
        );
        const link = screen.getByRole('link', {
            name: 'Connect your Hydra account',
        });
        const href = new URL(link.getAttribute('href') ?? '');
        expect(href.origin).toBe(window.location.origin);
        expect(href.pathname).toBe(
            '/api/v1/ee/projects/p-1/live-sources/c-1/user-sign-in/start',
        );
        expect(href.searchParams.get('returnTo')).toBe(
            '/projects/p-1/saved/chart?tab=1',
        );
    });

    it('asks to reconnect an expired sign-in found in a stored message', () => {
        const { message } = new LiveSourceSignInRequiredError(
            signIn('expired'),
        );
        const { error } = getAsyncQueryError(message);
        renderAt(<ConnectLiveSourceAction error={error} />);
        expect(
            screen.getByRole('link', { name: 'Reconnect your Hydra account' }),
        ).toBeInTheDocument();
        expect(getQueryErrorText(error)).toBe(
            'Your sign-in to Events expired or was revoked. Connect your Hydra account again to see this data.',
        );
    });

    it('renders nothing for other errors', () => {
        const error = { name: 'Error', message: 'Hydra returned 500' };
        renderAt(<ConnectLiveSourceAction error={error} />);
        expect(screen.queryByRole('link')).toBeNull();
        expect(getQueryErrorText(error)).toBe('Hydra returned 500');
    });
});
