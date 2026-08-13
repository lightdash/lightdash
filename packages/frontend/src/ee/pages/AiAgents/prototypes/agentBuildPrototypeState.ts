export type PrototypeBuildKind = 'dataApp' | 'chartType';

export type PrototypeBuildStatus =
    | 'drafting'
    | 'confirming'
    | 'queued'
    | 'building'
    | 'ready'
    | 'failed'
    | 'cancelled';

export type PrototypeDestination =
    | { type: 'agent' }
    | { type: 'workstream'; workstreamId: string };

export type PrototypeMessage = {
    id: string;
    role: 'user' | 'assistant';
    text: string;
    workstreamId?: string;
};

export type PrototypeInstruction = {
    id: string;
    text: string;
    delivery: 'next' | 'interrupt';
    status: 'pending' | 'applied';
};

export type PrototypeBuildBrief = {
    goal: string;
    output: string;
    dataContext: string[];
    interactions: string[];
    constraints: string[];
};

export type PrototypeWorkstream = {
    id: string;
    kind: PrototypeBuildKind;
    title: string;
    status: PrototypeBuildStatus;
    version: number;
    progress: number;
    brief: PrototypeBuildBrief;
    instructions: PrototypeInstruction[];
    activity: string[];
};

export type AgentBuildPrototypeState = {
    messages: PrototypeMessage[];
    workstreams: PrototypeWorkstream[];
    destination: PrototypeDestination;
    selectedWorkstreamId?: string;
    nextId: number;
};

export type AgentBuildPrototypeAction =
    | { type: 'createWorkstream'; kind: PrototypeBuildKind }
    | { type: 'finishDraft'; workstreamId: string }
    | { type: 'selectWorkstream'; workstreamId: string }
    | { type: 'setDestination'; destination: PrototypeDestination }
    | { type: 'submitMessage'; text: string }
    | { type: 'confirmBuild'; workstreamId: string }
    | { type: 'startBuild'; workstreamId: string }
    | { type: 'advanceBuild'; workstreamId: string }
    | { type: 'completeBuild'; workstreamId: string }
    | { type: 'failBuild'; workstreamId: string }
    | { type: 'cancelBuild'; workstreamId: string }
    | { type: 'retryBuild'; workstreamId: string }
    | { type: 'startQueuedVersion'; workstreamId: string }
    | {
          type: 'interruptWithInstruction';
          workstreamId: string;
          instructionId: string;
      }
    | { type: 'reset' };

const dataAppBrief: PrototypeBuildBrief = {
    goal: 'Create an executive revenue command center',
    output: 'Interactive Data App',
    dataContext: ['Orders', 'Customers', 'Revenue metrics'],
    interactions: ['Date-range filter', 'Region drill-down', 'Account detail'],
    constraints: ['Use the Lightdash theme', 'Desktop-first layout'],
};

const chartTypeBrief: PrototypeBuildBrief = {
    goal: 'Create a reusable cohort-retention heatmap',
    output: 'Reusable chart type',
    dataContext: [
        'Dimension: cohort_month',
        'Dimension: period',
        'Metric: retention_rate',
    ],
    interactions: ['Configurable color scale', 'Cell tooltip'],
    constraints: [
        'Render rows supplied by the host chart',
        'Do not query the semantic catalog',
    ],
};

export const initialAgentBuildPrototypeState: AgentBuildPrototypeState = {
    messages: [
        {
            id: 'message-1',
            role: 'user',
            text: 'Help me turn our revenue reporting into something the leadership team can explore.',
        },
        {
            id: 'message-2',
            role: 'assistant',
            text: 'The request has several views and drill-downs, so I would build a Data App rather than a single chart. I can draft the build plan before starting anything.',
        },
    ],
    workstreams: [],
    destination: { type: 'agent' },
    nextId: 3,
};

const appendActivity = (
    workstream: PrototypeWorkstream,
    message: string,
): PrototypeWorkstream => ({
    ...workstream,
    activity: [message, ...workstream.activity].slice(0, 6),
});

const updateWorkstream = (
    state: AgentBuildPrototypeState,
    workstreamId: string,
    update: (workstream: PrototypeWorkstream) => PrototypeWorkstream,
): AgentBuildPrototypeState => ({
    ...state,
    workstreams: state.workstreams.map((workstream) =>
        workstream.id === workstreamId ? update(workstream) : workstream,
    ),
});

export const agentBuildPrototypeReducer = (
    state: AgentBuildPrototypeState,
    action: AgentBuildPrototypeAction,
): AgentBuildPrototypeState => {
    switch (action.type) {
        case 'createWorkstream': {
            const id = `build-${state.nextId}`;
            const isDataApp = action.kind === 'dataApp';
            const workstream: PrototypeWorkstream = {
                id,
                kind: action.kind,
                title: isDataApp
                    ? 'Revenue command center'
                    : 'Cohort retention heatmap',
                status: 'drafting',
                version: 1,
                progress: 0,
                brief: isDataApp ? dataAppBrief : chartTypeBrief,
                instructions: [],
                activity: ['Drafting a structured build brief'],
            };

            return {
                ...state,
                workstreams: [...state.workstreams, workstream],
                selectedWorkstreamId: id,
                nextId: state.nextId + 1,
            };
        }

        case 'selectWorkstream':
            return { ...state, selectedWorkstreamId: action.workstreamId };

        case 'finishDraft':
            return updateWorkstream(state, action.workstreamId, (workstream) =>
                appendActivity(
                    { ...workstream, status: 'confirming' },
                    'Build brief ready for confirmation',
                ),
            );

        case 'setDestination':
            return { ...state, destination: action.destination };

        case 'submitMessage': {
            const text = action.text.trim();
            if (!text) return state;

            const userMessage: PrototypeMessage = {
                id: `message-${state.nextId}`,
                role: 'user',
                text,
                workstreamId:
                    state.destination.type === 'workstream'
                        ? state.destination.workstreamId
                        : undefined,
            };

            if (state.destination.type === 'agent') {
                return {
                    ...state,
                    messages: [
                        ...state.messages,
                        userMessage,
                        {
                            id: `message-${state.nextId + 1}`,
                            role: 'assistant',
                            text: 'I’ll answer that in the main conversation without changing any active build.',
                        },
                    ],
                    nextId: state.nextId + 2,
                };
            }

            const instructionId = `instruction-${state.nextId + 1}`;
            const nextState: AgentBuildPrototypeState = {
                ...state,
                messages: [...state.messages, userMessage],
                nextId: state.nextId + 2,
            };

            return updateWorkstream(
                nextState,
                state.destination.workstreamId,
                (workstream) =>
                    appendActivity(
                        {
                            ...workstream,
                            instructions: [
                                ...workstream.instructions,
                                {
                                    id: instructionId,
                                    text,
                                    delivery: 'next',
                                    status: 'pending',
                                },
                            ],
                        },
                        `Queued instruction: “${text}”`,
                    ),
            );
        }

        case 'confirmBuild':
            return updateWorkstream(state, action.workstreamId, (workstream) =>
                appendActivity(
                    { ...workstream, status: 'queued' },
                    'Build confirmed and queued',
                ),
            );

        case 'startBuild':
            return updateWorkstream(state, action.workstreamId, (workstream) =>
                appendActivity(
                    { ...workstream, status: 'building', progress: 12 },
                    `Version ${workstream.version} started`,
                ),
            );

        case 'advanceBuild':
            return updateWorkstream(state, action.workstreamId, (workstream) =>
                appendActivity(
                    {
                        ...workstream,
                        progress: Math.min(workstream.progress + 24, 92),
                    },
                    'Generation emitted another progress update',
                ),
            );

        case 'completeBuild':
            return updateWorkstream(state, action.workstreamId, (workstream) =>
                appendActivity(
                    { ...workstream, status: 'ready', progress: 100 },
                    `Version ${workstream.version} is ready`,
                ),
            );

        case 'failBuild':
            return updateWorkstream(state, action.workstreamId, (workstream) =>
                appendActivity(
                    { ...workstream, status: 'failed' },
                    `Version ${workstream.version} failed`,
                ),
            );

        case 'cancelBuild':
            return updateWorkstream(state, action.workstreamId, (workstream) =>
                appendActivity(
                    { ...workstream, status: 'cancelled' },
                    `Version ${workstream.version} cancelled`,
                ),
            );

        case 'retryBuild':
            return updateWorkstream(state, action.workstreamId, (workstream) =>
                appendActivity(
                    { ...workstream, status: 'queued', progress: 0 },
                    `Version ${workstream.version} queued for retry`,
                ),
            );

        case 'startQueuedVersion':
            return updateWorkstream(state, action.workstreamId, (workstream) =>
                appendActivity(
                    {
                        ...workstream,
                        status: 'building',
                        version: workstream.version + 1,
                        progress: 10,
                        instructions: workstream.instructions.map(
                            (instruction) =>
                                instruction.status === 'pending'
                                    ? { ...instruction, status: 'applied' }
                                    : instruction,
                        ),
                    },
                    `Queued changes started in version ${workstream.version + 1}`,
                ),
            );

        case 'interruptWithInstruction':
            return updateWorkstream(state, action.workstreamId, (workstream) =>
                appendActivity(
                    {
                        ...workstream,
                        status: 'building',
                        version: workstream.version + 1,
                        progress: 8,
                        instructions: workstream.instructions.map(
                            (instruction) =>
                                instruction.id === action.instructionId
                                    ? {
                                          ...instruction,
                                          status: 'applied',
                                          delivery: 'interrupt',
                                      }
                                    : instruction,
                        ),
                    },
                    `Interrupted version ${workstream.version}; instruction applied to version ${workstream.version + 1}`,
                ),
            );

        case 'reset':
            return initialAgentBuildPrototypeState;
    }
};
