import {
    assertUnreachable,
    type SemanticStudioBranchCompile,
} from '@lightdash/common';
import { Group, Loader, Text } from '@mantine/core';
import {
    IconAlertTriangle,
    IconCircle,
    IconCircleCheck,
} from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useDraftCheckout } from '../../../../../features/semanticStudio/useSemanticLayerModel';
import { useStudioWorkspaces } from '../../../../../features/semanticStudio/useStudioWorkspaces';
import { useStudioPullRequest } from './useStudioPullRequest';

type TaskState = 'done' | 'running' | 'failed' | 'todo';

const ICONS = {
    done: <MantineIcon icon={IconCircleCheck} size={14} color="green" />,
    running: <Loader size={12} color="gray" />,
    failed: <MantineIcon icon={IconAlertTriangle} size={14} color="yellow" />,
    todo: <MantineIcon icon={IconCircle} size={14} color="ldGray.4" />,
} satisfies Record<TaskState, ReactNode>;

const Task: FC<{ state: TaskState; label: string }> = ({ state, label }) => (
    <Group gap={4} wrap="nowrap" flex="none">
        {ICONS[state]}
        <Text fz="xs" c={state === 'todo' ? 'dimmed' : undefined}>
            {label}
        </Text>
    </Group>
);

const compileTask = (
    compile: SemanticStudioBranchCompile | null,
): { state: TaskState; label: string } => {
    if (!compile) return { state: 'todo', label: 'Compile' };
    switch (compile.status) {
        case 'compiling':
            return { state: 'running', label: 'Compiling' };
        case 'failed':
            return { state: 'failed', label: 'Compile failed' };
        case 'ready':
            return { state: 'done', label: 'Compiled' };
        default:
            return assertUnreachable(compile.status, 'Unknown compile status');
    }
};

/** Where the latest save of the checked-out draft stands, as tasks: saved, compiled, ready to try. */
export const DraftProgress: FC<{
    projectUuid: string;
    prUrl: string;
    commitSha: string | null;
}> = ({ projectUuid, prUrl, commitSha }) => {
    const pullRequest = useStudioPullRequest(projectUuid);
    const { data: workspaces } = useStudioWorkspaces(projectUuid);
    const { data: checkout } = useDraftCheckout(projectUuid);
    const draft = workspaces?.mine.find(
        ({ pullRequest: pr }) => pr?.url === prUrl,
    );
    // Only the latest save of the draft you have checked out has a compile to follow.
    if (
        !draft ||
        !checkout ||
        checkout.workspaceUuid !== draft.workspaceUuid ||
        pullRequest?.prUrl !== prUrl ||
        pullRequest.commitSha !== commitSha
    ) {
        return null;
    }
    const compile = compileTask(checkout.branchCompile);
    return (
        <Group gap="sm" wrap="wrap">
            <Task state="done" label="Saved to draft" />
            <Task state={compile.state} label={compile.label} />
            <Task
                state={compile.state === 'done' ? 'done' : 'todo'}
                label="Ready to try"
            />
        </Group>
    );
};
