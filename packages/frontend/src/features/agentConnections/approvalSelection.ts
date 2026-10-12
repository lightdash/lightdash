import {
    AgentCapability,
    type AgentConnectionApprovalProject,
} from '@lightdash/common';

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
    if (seconds === 86400) return '24 hours';
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
            return count ? [`${count} ${unit}${count === 1 ? '' : 's'}`] : [];
        })
        .join(', ');
};

export const warehouseStepMessage = (notice: string | null) =>
    notice
        ? 'No connection was created. You can still set up warehouse sign-ins for later.'
        : 'Your connection is saved. Sign in to run queries on these warehouses.';

export const warehouseStepCopy = {
    heading: 'Connect your warehouses',
    cancelledHeading: 'Approval cancelled',
    cancelledMessage: 'No connection was created.',
    sent: 'Sent to the CLI.',
    returnToCli: 'Return to the CLI',
    defer: 'Do this later',
    deferTo: '/generalSettings/myAgentConnections',
    loading: 'Loading warehouse sign-ins',
    loadingSignIn: 'Loading warehouse sign-in',
    checking: 'Checking warehouse sign-in',
    error: 'Could not load warehouse sign-in.',
    administrator: 'Ask an administrator to set up agent sign-in',
    ready: 'Ready',
    signIn: 'Sign in',
} as const;
