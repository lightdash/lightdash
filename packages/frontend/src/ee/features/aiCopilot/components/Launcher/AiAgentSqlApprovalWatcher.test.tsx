import { ErrorBoundary } from '@sentry/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createMemoryRouter, RouterProvider } from 'react-router';
import {
    afterAll,
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import { getProjectAiAgentQueryKey } from '../../hooks/useProjectAiAgents';
import { store } from '../../store';
import {
    setParts,
    startStreaming,
    stopStreaming,
    type StreamPart,
} from '../../store/aiAgentThreadStreamSlice';
import { AiAgentSqlApprovalWatcher } from './AiAgentSqlApprovalWatcher';

class NotificationStub {
    static permission: NotificationPermission = 'granted';

    static shown: NotificationStub[] = [];

    onclick: (() => void) | null = null;

    constructor(
        public title: string,
        public options: NotificationOptions,
    ) {
        NotificationStub.shown.push(this);
    }

    close() {}
}
vi.stubGlobal('Notification', NotificationStub);
afterAll(() => {
    vi.unstubAllGlobals();
});

const IDS = {
    projectUuid: 'project-1',
    agentUuid: 'agent-1',
    threadUuid: 'thread-1',
    messageUuid: 'message-1',
};

const runSql = (toolCallId: string): StreamPart => ({
    type: 'toolCall',
    toolCallId,
    toolName: 'runSql',
    toolArgs: { sql: 'select secret from accounts', limit: 100 },
    toolResult: null,
});

let visibilityState: DocumentVisibilityState = 'hidden';

const renderWatcher = () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(
        getProjectAiAgentQueryKey(IDS.projectUuid, IDS.agentUuid),
        { name: 'Sales agent' },
    );
    const router = createMemoryRouter(
        [{ path: '*', element: <AiAgentSqlApprovalWatcher /> }],
        { initialEntries: ['/projects/project-1/dashboards/d'] },
    );
    render(
        <QueryClientProvider client={queryClient}>
            <Provider store={store}>
                <RouterProvider router={router} />
            </Provider>
        </QueryClientProvider>,
    );
    return router;
};

const streamParts = (parts: StreamPart[], autoApproveSql = false) => {
    act(() => {
        store.dispatch(startStreaming({ ...IDS, autoApproveSql }));
        store.dispatch(setParts({ threadUuid: IDS.threadUuid, parts }));
    });
};

describe('AiAgentSqlApprovalWatcher', () => {
    beforeEach(() => {
        visibilityState = 'hidden';
        vi.spyOn(document, 'visibilityState', 'get').mockImplementation(
            () => visibilityState,
        );
        NotificationStub.permission = 'granted';
        NotificationStub.shown = [];
        window.sessionStorage.clear();
    });

    afterEach(() => {
        act(() => {
            store.dispatch(stopStreaming({ threadUuid: IDS.threadUuid }));
        });
        vi.restoreAllMocks();
    });

    it('notifies once per call awaiting approval while the tab is hidden', () => {
        renderWatcher();
        streamParts([runSql('call-1')]);
        act(() => {
            store.dispatch(
                setParts({
                    threadUuid: IDS.threadUuid,
                    parts: [
                        runSql('call-1'),
                        { type: 'text', text: 'still waiting' },
                    ],
                }),
            );
        });

        expect(NotificationStub.shown).toHaveLength(1);
        const [shown] = NotificationStub.shown;
        expect(shown.title).toBe('Approval needed');
        expect(shown.options).toMatchObject({
            body: 'Sales agent',
            tag: 'call-1',
        });
        expect(JSON.stringify(shown.options)).not.toContain('secret');
    });

    it('opens the thread when the notification is clicked', () => {
        const focus = vi.spyOn(window, 'focus').mockImplementation(() => {});
        const router = renderWatcher();
        streamParts([runSql('call-1')]);
        act(() => {
            NotificationStub.shown[0].onclick?.();
        });

        expect(focus).toHaveBeenCalled();
        expect(router.state.location.pathname).toBe(
            '/projects/project-1/ai-agents/agent-1/threads/thread-1',
        );
    });

    it('does not notify while the tab is visible, even after it is hidden', () => {
        visibilityState = 'visible';
        renderWatcher();
        streamParts([runSql('call-1')]);
        visibilityState = 'hidden';
        act(() => {
            store.dispatch(
                setParts({
                    threadUuid: IDS.threadUuid,
                    parts: [runSql('call-1'), { type: 'text', text: '…' }],
                }),
            );
        });

        expect(NotificationStub.shown).toHaveLength(0);
    });

    it('keeps its siblings mounted when the browser refuses to construct a notification', () => {
        class ThrowingNotification extends NotificationStub {
            constructor(title: string, options: NotificationOptions) {
                super(title, options);
                throw new TypeError('Illegal constructor');
            }
        }
        vi.stubGlobal('Notification', ThrowingNotification);
        vi.spyOn(console, 'error').mockImplementation(() => {});
        try {
            const router = createMemoryRouter(
                [
                    {
                        path: '*',
                        element: (
                            <ErrorBoundary fallback={<></>}>
                                <span>launcher</span>
                                <AiAgentSqlApprovalWatcher />
                            </ErrorBoundary>
                        ),
                    },
                ],
                { initialEntries: ['/projects/project-1/dashboards/d'] },
            );
            render(
                <QueryClientProvider client={new QueryClient()}>
                    <Provider store={store}>
                        <RouterProvider router={router} />
                    </Provider>
                </QueryClientProvider>,
            );
            streamParts([runSql('call-1')]);

            expect(NotificationStub.shown).toHaveLength(1);
            expect(screen.getByText('launcher')).toBeInTheDocument();
        } finally {
            vi.stubGlobal('Notification', NotificationStub);
        }
    });

    it('does not notify without permission', () => {
        NotificationStub.permission = 'default';
        renderWatcher();
        streamParts([runSql('call-1')]);

        expect(NotificationStub.shown).toHaveLength(0);
    });

    it('does not notify for approvals settled automatically', () => {
        renderWatcher();
        streamParts([runSql('server-approved')], true);
        window.sessionStorage.setItem(
            `sql-auto-approve:${IDS.threadUuid}`,
            'true',
        );
        streamParts([runSql('always-approved')]);

        expect(NotificationStub.shown).toHaveLength(0);
    });
});
