import { ActionIcon, Button, Menu } from '@mantine/core';
import {
    IconChevronDown,
    IconDotsVertical,
    IconEye,
    IconFileDiff,
    IconGitPullRequest,
} from '@tabler/icons-react';
import { useContext, useState, type FC } from 'react';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import { isBitbucketPullRequest } from './pullRequestCardUtils';
import { InStudioChatContext } from './studioChatContext';
import { WritebackDiffModal } from './WritebackDiffModal';

/**
 * The "View" half of the card's action group: a single dropdown that opens the
 * Lightdash preview, the pull request on its host, or the diff viewer. The
 * preview entry is omitted when there's no preview (non-GitHub run, failed
 * preview, or a setup PR). Owns the diff modal it launches.
 */
export const PullRequestViewMenu: FC<{
    projectUuid: string;
    prUrl: string;
    previewUrl: string | null;
    commitSha: string | null;
}> = ({ projectUuid, prUrl, previewUrl, commitSha }) => {
    const [diffOpened, setDiffOpened] = useState(false);
    const quiet = useContext(InStudioChatContext);

    return (
        <>
            <Menu position={quiet ? 'bottom-end' : 'bottom-start'}>
                <Menu.Target>
                    {quiet ? (
                        <ActionIcon size="sm" aria-label="More">
                            <MantineIcon icon={IconDotsVertical} />
                        </ActionIcon>
                    ) : (
                        <Button
                            variant="default"
                            size="compact-xs"
                            leftSection={
                                <MantineIcon icon={IconEye} size={14} />
                            }
                            rightSection={
                                <MantineIcon icon={IconChevronDown} size={14} />
                            }
                        >
                            View
                        </Button>
                    )}
                </Menu.Target>
                <Menu.Dropdown>
                    {previewUrl && (
                        <Menu.Item
                            component="a"
                            href={previewUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            leftSection={
                                <MantineIcon icon={IconEye} size={14} />
                            }
                        >
                            Preview
                        </Menu.Item>
                    )}
                    <Menu.Item
                        component="a"
                        href={prUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        leftSection={
                            <MantineIcon icon={IconGitPullRequest} size={14} />
                        }
                    >
                        Pull request
                    </Menu.Item>
                    {!isBitbucketPullRequest(prUrl) && (
                        <Menu.Item
                            leftSection={
                                <MantineIcon icon={IconFileDiff} size={14} />
                            }
                            onClick={() => setDiffOpened(true)}
                        >
                            Diff
                        </Menu.Item>
                    )}
                </Menu.Dropdown>
            </Menu>
            <WritebackDiffModal
                projectUuid={projectUuid}
                prUrl={prUrl}
                commitSha={commitSha}
                opened={diffOpened}
                onClose={() => setDiffOpened(false)}
            />
        </>
    );
};
