import {
    ActionIcon,
    Anchor,
    Button,
    Group,
    Text,
    Tooltip,
} from '@mantine/core';
import { IconExternalLink, IconEye, IconEyeOff } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { DevelopmentBar } from '../../../../../features/semanticStudio/DevelopmentBar';
import { useDevelopmentView } from '../../../../../features/semanticStudio/developmentView';
import { useMergePullRequest } from '../../hooks/useMergePullRequest';
import { isMergeable } from '../ChatElements/ToolCalls/pullRequestActions';
import { type StudioPullRequest } from './useStudioPullRequest';

/** What a dbt project's Studio conversation has saved so far: its pull request, a look at the result, and publishing it. */
export const StudioDevelopmentBar: FC<{
    projectUuid: string;
    pullRequest: StudioPullRequest;
}> = ({ projectUuid, pullRequest }) => {
    const { prUrl, commitSha, additions, deletions, previewProjectUuid } =
        pullRequest;
    const { mutate: merge, isLoading } = useMergePullRequest(projectUuid);
    const [armed, setArmed] = useState(false);
    const [isTrying, setIsTrying] = useDevelopmentView();
    const number = /\/(\d+)\/?$/.exec(prUrl)?.[1];
    return (
        <DevelopmentBar
            summary={
                <>
                    <Anchor
                        href={prUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        fz="xs"
                        c="dimmed"
                        truncate
                    >
                        Pull request{number ? ` #${number}` : ''}
                    </Anchor>
                    <Group gap={4} wrap="nowrap" flex="none">
                        {additions !== null ? (
                            <Text fz="xs" c="green" ff="monospace">
                                +{additions}
                            </Text>
                        ) : null}
                        {deletions !== null ? (
                            <Text fz="xs" c="red" ff="monospace">
                                −{deletions}
                            </Text>
                        ) : null}
                    </Group>
                </>
            }
        >
            {previewProjectUuid ? (
                <Tooltip label="Open the preview project built from this pull request">
                    <ActionIcon
                        component={Link}
                        to={`/projects/${previewProjectUuid}/semantic-layer`}
                        target="_blank"
                        aria-label="Open the preview project"
                    >
                        <MantineIcon icon={IconExternalLink} />
                    </ActionIcon>
                </Tooltip>
            ) : null}
            {previewProjectUuid || pullRequest.isOpen ? (
                <Tooltip
                    label={
                        previewProjectUuid
                            ? "Explore and your charts read the pull request's models. Only you see them."
                            : 'Explore and your charts read your latest change. Only you see them. New models can be tried once the preview is built.'
                    }
                >
                    <Button
                        size="xs"
                        variant="default"
                        leftSection={
                            <MantineIcon
                                icon={isTrying ? IconEyeOff : IconEye}
                                size={14}
                            />
                        }
                        onClick={() =>
                            setIsTrying(!isTrying, previewProjectUuid)
                        }
                    >
                        {isTrying ? 'Back to live' : 'Try my changes'}
                    </Button>
                </Tooltip>
            ) : null}
            <Button
                size="xs"
                loading={isLoading}
                disabled={!isMergeable(pullRequest.ciChecks)}
                onBlur={() => setArmed(false)}
                onClick={() =>
                    armed ? merge({ prUrl, sha: commitSha }) : setArmed(true)
                }
            >
                {armed ? 'Confirm publish' : 'Publish'}
            </Button>
        </DevelopmentBar>
    );
};
