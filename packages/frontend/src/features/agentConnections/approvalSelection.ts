import {
    AgentCapability,
    type AgentConnectionApprovalProject,
} from '@lightdash/common';
import i18n from '../../i18n/i18n';

const tr = (key: string, options?: Record<string, unknown>) =>
    i18n.t(`agentConnections.${key}`, { ns: 'aiAccess', ...options });

export const getApprovalActions = (
    projects: AgentConnectionApprovalProject[],
) =>
    Object.values(AgentCapability).flatMap((capability) => {
        const entries = projects.flatMap((project) => {
            const answer = project.capabilities.find(
                (entry) => entry.capability === capability,
            );
            return answer ? [{ project, answer }] : [];
        });
        if (
            !entries.some(
                ({ answer }) =>
                    answer.visibility === 'offered' ||
                    answer.visibility === 'blocked',
            )
        )
            return [];
        return [
            {
                capability,
                offered: entries.filter(
                    ({ answer }) => answer.visibility === 'offered',
                ).length,
                blocked: entries
                    .filter(({ answer }) => answer.visibility === 'blocked')
                    .map(({ project, answer }) => ({
                        projectUuid: project.projectUuid,
                        name: project.name,
                        reason: answer.reason,
                    })),
            },
        ];
    });

export const approvalDuration = (seconds: number) => {
    if (seconds === 86400) return tr('duration.hour', { count: 24 });
    let remaining = seconds;
    return (
        [
            ['day', 86400],
            ['hour', 3600],
            ['minute', 60],
            ['second', 1],
        ] as const
    )
        .flatMap(([unit, size]) => {
            const count = Math.floor(remaining / size);
            remaining %= size;
            return count ? [tr(`duration.${unit}`, { count })] : [];
        })
        .join(tr('duration.separator'));
};

// The server sends a notice while approving only records a decision.
export const warehouseStepOutcome = (notice: string | null) =>
    notice ? tr('warehouseStep.noConnection') : tr('warehouseStep.saved');

export const warehouseStepMessage = (notice: string | null) =>
    notice ? tr('warehouseStep.setUpLater') : tr('warehouseStep.signInToRun');

const copy = (key: string) => tr(`warehouseStep.${key}`);

export const warehouseStepCopy = {
    get heading() {
        return copy('heading');
    },
    get cancelledHeading() {
        return copy('cancelledHeading');
    },
    get cancelledMessage() {
        return copy('noConnection');
    },
    get nextStep() {
        return copy('nextStep');
    },
    get returnToCli() {
        return copy('returnToCli');
    },
    get defer() {
        return copy('defer');
    },
    deferTo: '/generalSettings/myAgentConnections?tab=warehouses',
    get loading() {
        return copy('loading');
    },
    get loadingSignIn() {
        return copy('loadingSignIn');
    },
    get checking() {
        return copy('checking');
    },
    get error() {
        return copy('error');
    },
    get administrator() {
        return copy('administrator');
    },
    get ready() {
        return copy('ready');
    },
    get signIn() {
        return copy('signIn');
    },
};
