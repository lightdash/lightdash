import { type SemanticStudioWorkspace } from '@lightdash/common';
import { Badge, Box, Text, UnstyledButton } from '@mantine/core';
import {
    IconCheck,
    IconExternalLink,
    IconLayersIntersect,
} from '@tabler/icons-react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import classes from './StudioWorkspacesList.module.css';
import { pullRequestNumberOf } from './urls';
import { useStudioWorkspaces } from './useStudioWorkspaces';

dayjs.extend(relativeTime);

const whereItStands = ({ pullRequest }: SemanticStudioWorkspace): string => {
    const number = pullRequestNumberOf(pullRequest?.url);
    if (!pullRequest) return 'Not saved yet';
    switch (pullRequest.state) {
        case 'merged':
            return number ? `Live, merged as #${number}` : 'Live';
        case 'closed':
            return number ? `Closed #${number}` : 'Closed';
        default:
            return number ? `In review #${number}` : 'In review';
    }
};

const Row: FC<{
    workspace: SemanticStudioWorkspace;
    detail: string;
    onOpen: () => void;
    isLink: boolean;
}> = ({ workspace, detail, onOpen, isLink }) => (
    <UnstyledButton
        className={classes.row}
        data-active={workspace.isActive}
        onClick={onOpen}
    >
        <MantineIcon
            icon={IconLayersIntersect}
            size={16}
            className={classes.icon}
        />
        <Box miw={0}>
            <Text fz="sm" fw={500} truncate>
                {workspace.name}
            </Text>
            <Text fz="xs" c="dimmed" truncate>
                {detail}
            </Text>
        </Box>
        {workspace.isActive ? (
            <Badge variant="light" color="gray" size="sm" radius="xl">
                Open
            </Badge>
        ) : isLink ? (
            <MantineIcon
                icon={IconExternalLink}
                size={14}
                className={classes.icon}
            />
        ) : null}
    </UnstyledButton>
);

/** Your work in flight, others' (to be aware of), and a quiet line of what finished lately. */
export const StudioWorkspacesList: FC<{
    projectUuid: string;
    onOpen: (workspace: SemanticStudioWorkspace) => void;
}> = ({ projectUuid, onOpen }) => {
    const { data, isInitialLoading, error } = useStudioWorkspaces(projectUuid);
    if (isInitialLoading) return null;
    if (error || !data) {
        return (
            <Text fz="sm" c="dimmed" ta="center" py="xl">
                Changes could not be loaded.
            </Text>
        );
    }
    const { mine, others, recent } = data;
    return (
        <Box className={classes.page}>
            <Text fz="lg" fw={600}>
                Changes
            </Text>
            <Text fz="sm" c="dimmed">
                Each change runs from its first proposal until it is live. Ask
                for one in the chat to start.
            </Text>
            <Text className={classes.section}>Yours</Text>
            {mine.length === 0 ? (
                <Text fz="sm" c="dimmed">
                    Nothing in flight.
                </Text>
            ) : (
                <Box className={classes.list}>
                    {mine.map((workspace) => (
                        <Row
                            key={workspace.workspaceUuid}
                            workspace={workspace}
                            detail={`${whereItStands(workspace)} · ${dayjs(workspace.updatedAt).fromNow()}`}
                            isLink={false}
                            onOpen={() => onOpen(workspace)}
                        />
                    ))}
                </Box>
            )}
            {others.length > 0 ? (
                <>
                    <Text className={classes.section}>
                        In flight from others
                    </Text>
                    <Box className={classes.list}>
                        {others.map((workspace) => (
                            <Row
                                key={workspace.workspaceUuid}
                                workspace={workspace}
                                detail={`${workspace.owner.name} · ${whereItStands(workspace)} · view only`}
                                isLink={!!workspace.pullRequest}
                                onOpen={() => {
                                    if (workspace.pullRequest) {
                                        window.open(
                                            workspace.pullRequest.url,
                                            '_blank',
                                            'noopener,noreferrer',
                                        );
                                    }
                                }}
                            />
                        ))}
                    </Box>
                </>
            ) : null}
            {recent.length > 0 ? (
                <>
                    <Text className={classes.section}>Done recently</Text>
                    <Box className={classes.history}>
                        {recent.map((workspace) => (
                            <UnstyledButton
                                key={workspace.workspaceUuid}
                                fz="xs"
                                c="dimmed"
                                onClick={() => onOpen(workspace)}
                            >
                                <MantineIcon
                                    icon={IconCheck}
                                    size={12}
                                    display="inline"
                                />{' '}
                                {workspace.name},{' '}
                                {dayjs(workspace.finishedAt).fromNow()}
                            </UnstyledButton>
                        ))}
                    </Box>
                </>
            ) : null}
        </Box>
    );
};
