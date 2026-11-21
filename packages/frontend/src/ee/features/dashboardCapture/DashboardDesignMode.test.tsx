import { type AiPromptContextInput } from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { type BubbleReplyPost } from '../aiCopilot/components/BubbleThread/BubbleReplyPoster';
import { TYPED_WORDS_MARK } from '../capture/buildDesignPrompt';
import { type Bubble, type DesignSession } from '../capture/designSession';
import {
    type CaptureMark,
    type DesignPayload,
    type DesignSendResult,
    type DesignSurface,
} from '../capture/types';
import { type BubbleSendInput } from '../capture/useBubbleSend';
import DashboardDesignMode from './DashboardDesignMode';

type DesignOpts = {
    onSend: (payload: DesignPayload) => Promise<DesignSendResult>;
    renderBubbleBody:
        | ((bubble: Bubble, session: DesignSession) => ReactNode)
        | null;
    picker: unknown;
    cancelSend: (bubbleId: string) => void;
};
type ThreadProps = {
    threadId: string;
    armed: boolean;
    replyCollecting: boolean;
    onSendReply: (
        prompt: string,
        context: AiPromptContextInput,
    ) => Promise<void>;
};

const overview = { uuid: 'tab-1', name: 'Overview', order: 0 };
const marketing = { uuid: 'tab-2', name: 'Marketing', order: 1 };

const mocks = vi.hoisted(() => ({
    mode: undefined as string | undefined,
    embedded: false,
    flagEnabled: true,
    canUseAgents: true,
    agents: [{ uuid: 'agent-1' }] as unknown[],
    surface: null as unknown,
    opts: null as unknown,
    design: {
        on: false,
        setOn: vi.fn(),
        session: { bubbles: [], active: { kind: 'page' } } as unknown,
        screenChanged: vi.fn(),
        arm: vi.fn(),
        send: vi.fn(),
        expand: vi.fn(),
    },
    bubbleSend: vi.fn(),
    cancelSend: vi.fn(),
    picker: null as unknown,
    navigate: vi.fn(),
    state: null as unknown,
    replyPost: vi.fn(),
    threadProps: [] as unknown[],
}));

vi.mock('react-router', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    useParams: () => ({ mode: mocks.mode, dashboardUuid: 'dash-1' }),
    useNavigate: () => mocks.navigate,
    useLocation: () => ({ pathname: '/', search: '' }),
}));
vi.mock('../../../hooks/useProjectRoute', () => ({
    useProjectUrlIdentifier: () => 'project-1',
}));
vi.mock('../../providers/Embed/useIsEmbedded', () => ({
    default: () => mocks.embedded,
}));
vi.mock('../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: { enabled: mocks.flagEnabled } }),
}));
vi.mock('../../../providers/App/useApp', () => ({
    default: () => ({
        // The test providers read `rudder` from the same health data.
        health: {
            data: { ai: { voiceTranscriptionAvailable: true }, rudder: {} },
        },
    }),
}));
vi.mock('../../../providers/LightdashApi/useLightdashApi', () => ({
    useLightdashApi: () => vi.fn(),
}));
vi.mock('../../../providers/Dashboard/useDashboardContext', () => ({
    default: (selector: (context: unknown) => unknown) =>
        selector({
            projectUuid: 'project-1',
            dashboard: { uuid: 'dash-1', name: 'Sales' },
        }),
}));
vi.mock('../../../features/dashboard/store', () => {
    type State = {
        tiles: unknown[];
        tabs: unknown[];
        activeTab: { uuid: string } | undefined;
    };
    return {
        useDashboardSelector: (selector: (state: unknown) => unknown) =>
            selector(mocks.state),
        selectDashboardTiles: (state: State) => state.tiles,
        selectDashboardTabs: (state: State) => state.tabs,
        selectActiveTab: (state: State) => state.activeTab,
        selectActiveTabUuid: (state: State) => state.activeTab?.uuid,
    };
});
vi.mock('../capture/useDesignMode', () => ({
    useDesignMode: (surface: unknown, opts: unknown) => {
        mocks.surface = surface;
        mocks.opts = opts;
        return { ...mocks.design, element: null };
    },
}));
vi.mock('../capture/useBubbleSend', () => ({
    useBubbleSend: () => ({
        send: mocks.bubbleSend,
        cancel: mocks.cancelSend,
        picker: mocks.picker,
    }),
}));
vi.mock('../aiCopilot/hooks/useAiAgentsButtonVisibility', () => ({
    useProjectAiAgentButtonVisibility: () => mocks.canUseAgents,
}));
vi.mock('../aiCopilot/components/Launcher/useDefaultAiAgent', () => ({
    useDefaultAiAgent: () => ({ agents: mocks.agents }),
}));
vi.mock('../aiCopilot/components/Launcher/launcherDockExtras', () => ({
    useLauncherDockExtras: () => null,
}));
vi.mock('../aiCopilot/components/BubbleThread/BubbleThread', () => ({
    BubbleThread: (props: { threadId: string }) => {
        mocks.threadProps.push(props);
        return <div>Thread {props.threadId}</div>;
    },
}));
// Stands in for the thread's own way of posting a reply.
vi.mock('../aiCopilot/components/BubbleThread/BubbleReplyPoster', () => ({
    default: ({
        bubbleId,
        register,
    }: {
        bubbleId: string;
        register: (bubbleId: string, post: BubbleReplyPost | null) => void;
    }) => {
        register(bubbleId, mocks.replyPost);
        return null;
    },
}));

const chartTile = (uuid: string, tabUuid: string) => ({
    uuid,
    type: 'saved_chart',
    x: 0,
    y: 0,
    w: 12,
    h: 6,
    tabUuid,
    properties: { title: `Title of ${uuid}`, savedChartUuid: `chart-${uuid}` },
});

const mark = (overrides: Partial<CaptureMark>): CaptureMark => ({
    number: 1,
    imageIndex: 0,
    startMs: 0,
    endMs: 100,
    strokes: [],
    shape: 'circle',
    tabName: 'Overview',
    box: { x: 0, y: 0, width: 0.1, height: 0.1 },
    arrow: null,
    target: null,
    arrowTo: null,
    trail: [],
    covers: [],
    ...overrides,
});

const threadBubble = (overrides: Partial<Bubble>): Bubble => ({
    id: 'bubble-1',
    homeTabUuid: 'tab-1',
    anchor: { x: 0, y: 0 },
    status: 'thread',
    input: 'text',
    collection: null,
    sentMarks: [],
    threadId: 'thread-1',
    agentUuid: 'agent-1',
    color: 0,
    minimised: false,
    unread: false,
    sendFailed: false,
    ...overrides,
});

const session = (bubbles: Bubble[]): DesignSession => ({
    bubbles,
    active: { kind: 'page' },
});

const opts = () => mocks.opts as DesignOpts;
const surface = () => mocks.surface as DesignSurface | null;
const lastThread = () => mocks.threadProps.at(-1) as ThreadProps;
const image = new File(['x'], 'capture-0.jpg', { type: 'image/jpeg' });

const payload = (overrides: Partial<DesignPayload>): DesignPayload => ({
    bubbleId: 'bubble-1',
    summary: '- ① (0:01) picked "Title of tile-1"',
    typed: 'make this green',
    marks: [],
    images: [image],
    transcript: [],
    ...overrides,
});

describe('DashboardDesignMode', () => {
    beforeEach(() => {
        mocks.mode = undefined;
        mocks.embedded = false;
        mocks.flagEnabled = true;
        mocks.canUseAgents = true;
        mocks.agents = [{ uuid: 'agent-1' }];
        mocks.surface = null;
        mocks.opts = null;
        mocks.picker = null;
        mocks.threadProps = [];
        mocks.design.on = false;
        mocks.design.session = session([]);
        mocks.design.setOn.mockClear();
        mocks.design.send.mockClear();
        mocks.design.arm.mockClear();
        mocks.bubbleSend.mockReset();
        mocks.replyPost.mockReset();
        mocks.navigate.mockClear();
        mocks.state = {
            tiles: [chartTile('tile-1', 'tab-1'), chartTile('tile-2', 'tab-2')],
            tabs: [overview, marketing],
            activeTab: overview,
        };
    });

    it('not offered in edit mode or in an embed', () => {
        mocks.mode = 'edit';
        const edit = renderWithProviders(<DashboardDesignMode />);
        expect(
            screen.queryByRole('button', { name: 'Design Mode' }),
        ).toBeNull();
        edit.unmount();

        mocks.mode = undefined;
        mocks.embedded = true;
        const embed = renderWithProviders(<DashboardDesignMode />);
        expect(
            screen.queryByRole('button', { name: 'Design Mode' }),
        ).toBeNull();
        embed.unmount();

        mocks.embedded = false;
        mocks.flagEnabled = false;
        const flagOff = renderWithProviders(<DashboardDesignMode />);
        expect(
            screen.queryByRole('button', { name: 'Design Mode' }),
        ).toBeNull();
        flagOff.unmount();

        mocks.flagEnabled = true;
        renderWithProviders(<DashboardDesignMode />);
        expect(
            screen.getByRole('button', { name: 'Design Mode' }),
        ).toBeInTheDocument();
    });

    it('not offered to someone with no agent to send to', () => {
        mocks.canUseAgents = false;
        const noAccess = renderWithProviders(<DashboardDesignMode />);
        expect(
            screen.queryByRole('button', { name: 'Design Mode' }),
        ).toBeNull();
        noAccess.unmount();

        mocks.canUseAgents = true;
        mocks.agents = [];
        renderWithProviders(<DashboardDesignMode />);
        expect(
            screen.queryByRole('button', { name: 'Design Mode' }),
        ).toBeNull();
    });

    it('the dock button turns Design Mode on and off', () => {
        const { rerender } = renderWithProviders(<DashboardDesignMode />);
        fireEvent.click(screen.getByRole('button', { name: 'Design Mode' }));
        expect(mocks.design.setOn).toHaveBeenLastCalledWith(true);

        mocks.design.on = true;
        rerender(<DashboardDesignMode />);
        fireEvent.click(screen.getByRole('button', { name: 'Design Mode' }));
        expect(mocks.design.setOn).toHaveBeenLastCalledWith(false);
    });

    it('draws from the page and reports the active tab', () => {
        renderWithProviders(<DashboardDesignMode />);
        expect(surface()?.frameSource).toBe('dom');
        expect(surface()?.grabAppImage).toBeNull();
        expect(surface()?.pickAt).not.toBeNull();
        expect(surface()?.transcribe).not.toBeNull();
        expect(surface()?.getTab()).toEqual({
            uuid: 'tab-1',
            name: 'Overview',
        });
    });

    it('a send carries the dashboard and the picked chart', async () => {
        mocks.bubbleSend.mockResolvedValue({
            threadId: 'thread-1',
            agentUuid: 'agent-1',
        });
        mocks.design.session = session([
            threadBubble({
                status: 'collecting',
                threadId: null,
                agentUuid: null,
            }),
        ]);
        renderWithProviders(<DashboardDesignMode />);

        const result = await opts().onSend(
            payload({
                marks: [
                    mark({
                        shape: 'pick',
                        target: {
                            kind: 'tile',
                            id: 'tile-1',
                            label: 'Title of tile-1',
                            parentId: null,
                        },
                    }),
                ],
            }),
        );

        expect(result).toEqual({ threadId: 'thread-1', agentUuid: 'agent-1' });
        const [sent] = mocks.bubbleSend.mock.calls[0] as [BubbleSendInput];
        expect(sent.bubbleId).toBe('bubble-1');
        expect(sent.images).toEqual([image]);
        expect(sent.context).toEqual([
            { type: 'dashboard', dashboardUuid: 'dash-1' },
            { type: 'chart', chartUuid: 'chart-tile-1' },
        ]);
        expect(sent.buildPrompt(false)).toBe(
            [
                'These requests are about the dashboard "Sales".',
                '- ① (0:01) picked "Title of tile-1"',
                `${TYPED_WORDS_MARK}make this green`,
            ].join('\n\n'),
        );
    });

    it('a reply with marks goes to the bubble’s own conversation', async () => {
        mocks.replyPost.mockResolvedValue(undefined);
        const bubble = threadBubble({});
        mocks.design.session = {
            bubbles: [bubble],
            active: { kind: 'bubble', bubbleId: bubble.id },
        };
        renderWithProviders(<DashboardDesignMode />);
        renderWithProviders(
            <>
                {opts().renderBubbleBody?.(
                    bubble,
                    mocks.design.session as DesignSession,
                )}
            </>,
        );

        // The composer hands over its words and what was mentioned in it.
        await lastThread().onSendReply('and this one', [
            { type: 'chart', chartUuid: 'chart-mentioned' },
        ]);
        expect(mocks.design.send).toHaveBeenCalledWith(
            'bubble-1',
            'and this one',
        );

        const result = await opts().onSend(
            payload({ typed: 'and this one', summary: '' }),
        );

        expect(result).toEqual({ threadId: 'thread-1', agentUuid: 'agent-1' });
        expect(mocks.bubbleSend).not.toHaveBeenCalled();
        const [posted] = mocks.replyPost.mock.calls[0] as [
            Parameters<BubbleReplyPost>[0],
        ];
        expect(posted.images).toEqual([image]);
        expect(posted.context).toEqual([
            { type: 'chart', chartUuid: 'chart-mentioned' },
        ]);
        expect(posted.buildPrompt(true)).toBe(
            `${TYPED_WORDS_MARK}and this one`,
        );
    });

    it('shows the agent picker in the bubble that waits on it', () => {
        const onPick = vi.fn();
        mocks.picker = {
            bubbleId: 'bubble-1',
            candidates: [
                {
                    agentUuid: 'agent-2',
                    name: 'Finance agent',
                    agent: null,
                    isRecommended: false,
                },
            ],
            onPick,
            cancel: vi.fn(),
        };
        renderWithProviders(<DashboardDesignMode />);
        renderWithProviders(
            <>
                {opts().renderBubbleBody?.(
                    threadBubble({
                        status: 'picking-agent',
                        threadId: null,
                        agentUuid: null,
                    }),
                    session([]),
                )}
            </>,
        );

        fireEvent.click(screen.getByRole('button', { name: /Finance agent/ }));
        expect(onPick).toHaveBeenCalledWith('agent-2');
    });

    it('a sent bubble shows its conversation, armed when it is the target', () => {
        const bubble = threadBubble({});
        mocks.design.session = {
            bubbles: [bubble],
            active: { kind: 'bubble', bubbleId: bubble.id },
        };
        renderWithProviders(<DashboardDesignMode />);
        renderWithProviders(
            <>
                {opts().renderBubbleBody?.(
                    bubble,
                    mocks.design.session as DesignSession,
                )}
            </>,
        );

        expect(screen.getByText('Thread thread-1')).toBeInTheDocument();
        expect(lastThread().armed).toBe(true);
        expect(lastThread().replyCollecting).toBe(false);
    });

    it('a mark on another tab shows a chip that goes to that tab the way the tab bar does', () => {
        const bubble = threadBubble({
            sentMarks: [
                mark({ number: 1, tabName: 'Overview' }),
                mark({ number: 2, tabName: 'Marketing' }),
            ],
        });
        mocks.design.session = session([bubble]);
        renderWithProviders(<DashboardDesignMode />);
        renderWithProviders(
            <>
                {opts().renderBubbleBody?.(
                    bubble,
                    mocks.design.session as DesignSession,
                )}
            </>,
        );

        expect(
            screen.queryByRole('button', { name: /on Overview/ }),
        ).toBeNull();
        fireEvent.click(
            screen.getByRole('button', { name: 'Mark 2 on Marketing' }),
        );
        expect(mocks.navigate).toHaveBeenCalledWith(
            expect.objectContaining({
                pathname: `/projects/project-1/dashboards/dash-1/view/tabs/${marketing.uuid}`,
            }),
            { replace: true },
        );
    });
});
