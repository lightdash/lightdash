import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { DashboardRefreshButton } from './DashboardRefreshButton';

const invalidateDashboardRelatedQueries = vi.fn(() => Promise.resolve());
const invalidateDashboardResultsQueries = vi.fn(() => Promise.resolve());
const removeDashboardResultsQueries = vi.fn();
const clearCacheAndFetch = vi.fn();
const setIsAutoRefresh = vi.fn();

vi.mock('../../../hooks/dashboard/useDashboardRefresh', () => ({
    useDashboardRefresh: () => ({
        isFetching: 0,
        invalidateDashboardRelatedQueries,
        invalidateDashboardResultsQueries,
        removeDashboardResultsQueries,
    }),
}));

vi.mock('../../../hooks/toaster/useToaster', () => ({
    default: () => ({ showToastSuccess: vi.fn() }),
}));

vi.mock('../../../providers/Dashboard/useDashboardTileStatusContext', () => ({
    default: (
        selector: (context: {
            clearCacheAndFetch: () => void;
            setIsAutoRefresh: (value: boolean) => void;
        }) => unknown,
    ) => selector({ clearCacheAndFetch, setIsAutoRefresh }),
}));

const FIVE_MINUTES = 5 * 60 * 1000;
// The timer is armed a frame after the click, so give ticks a little slack.
const SLACK = 100;

const renderButton = () => {
    const onIntervalChange = vi.fn();
    const view = renderWithProviders(
        <DashboardRefreshButton onIntervalChange={onIntervalChange} />,
    );
    return { ...view, onIntervalChange };
};

const chooseInterval = async (
    user: ReturnType<typeof userEvent.setup>,
    label: string,
) => {
    const [, menuTrigger] = within(screen.getByRole('group')).getAllByRole(
        'button',
    );
    await user.click(menuTrigger);
    await user.click(screen.getByRole('menuitem', { name: label }));
};

const advance = (ms: number) => {
    act(() => {
        vi.advanceTimersByTime(ms);
    });
};

describe('DashboardRefreshButton auto-refresh', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.clearAllMocks();
    });

    test('refreshes once per chosen interval, not continuously', async () => {
        const user = userEvent.setup({
            advanceTimers: vi.advanceTimersByTime,
            delay: null,
        });
        renderButton();

        await chooseInterval(user, '5m');

        advance(FIVE_MINUTES - SLACK);
        expect(clearCacheAndFetch).not.toHaveBeenCalled();

        advance(2 * SLACK);
        expect(clearCacheAndFetch).toHaveBeenCalledTimes(1);

        advance(FIVE_MINUTES);
        expect(clearCacheAndFetch).toHaveBeenCalledTimes(2);
    });

    test('re-rendering while waiting does not reset the schedule', async () => {
        const user = userEvent.setup({
            advanceTimers: vi.advanceTimersByTime,
            delay: null,
        });
        const { rerender } = renderButton();

        await chooseInterval(user, '5m');

        for (let elapsed = 0; elapsed < FIVE_MINUTES; elapsed += 60_000) {
            advance(60_000);
            rerender(<DashboardRefreshButton onIntervalChange={vi.fn()} />);
        }
        advance(SLACK);
        expect(clearCacheAndFetch).toHaveBeenCalledTimes(1);
    });

    test('switching interval and turning off both take effect', async () => {
        const user = userEvent.setup({
            advanceTimers: vi.advanceTimersByTime,
            delay: null,
        });
        renderButton();

        await chooseInterval(user, '5m');
        await chooseInterval(user, '15m');

        advance(FIVE_MINUTES);
        expect(clearCacheAndFetch).not.toHaveBeenCalled();
        advance(2 * FIVE_MINUTES);
        expect(clearCacheAndFetch).toHaveBeenCalledTimes(1);

        await chooseInterval(user, 'Off');
        expect(setIsAutoRefresh).toHaveBeenLastCalledWith(false);

        advance(6 * FIVE_MINUTES);
        expect(clearCacheAndFetch).toHaveBeenCalledTimes(1);
    });

    test('unmounting stops the timer', async () => {
        const user = userEvent.setup({
            advanceTimers: vi.advanceTimersByTime,
            delay: null,
        });
        const { unmount, onIntervalChange } = renderButton();

        await chooseInterval(user, '5m');
        expect(onIntervalChange).toHaveBeenCalledWith(5);

        unmount();
        expect(onIntervalChange).toHaveBeenLastCalledWith(undefined);

        advance(3 * FIVE_MINUTES);
        expect(clearCacheAndFetch).not.toHaveBeenCalled();
    });
});
