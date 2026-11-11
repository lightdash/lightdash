import { Anchor, Badge, Button, Group, Text } from '@mantine/core';
import { IconExternalLink } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
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
    const number = /\/(\d+)\/?$/.exec(prUrl)?.[1];
    return (
        <Group gap="sm" wrap="nowrap" miw={0} flex={1}>
            <Badge color="orange" flex="none">
                In development
            </Badge>
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
            <Group gap="xs" wrap="nowrap" ml="auto" flex="none">
                {previewProjectUuid ? (
                    <Button
                        component={Link}
                        to={`/projects/${previewProjectUuid}/semantic-layer`}
                        target="_blank"
                        size="xs"
                        variant="default"
                        rightSection={
                            <MantineIcon icon={IconExternalLink} size={14} />
                        }
                    >
                        Preview
                    </Button>
                ) : null}
                <Button
                    size="xs"
                    loading={isLoading}
                    disabled={!isMergeable(pullRequest.ciChecks)}
                    onBlur={() => setArmed(false)}
                    onClick={() =>
                        armed
                            ? merge({ prUrl, sha: commitSha })
                            : setArmed(true)
                    }
                >
                    {armed ? 'Confirm publish' : 'Publish'}
                </Button>
            </Group>
        </Group>
    );
};
