import { ActionIcon, Button, Menu } from '@mantine/core';
import {
    IconBrandGithub,
    IconChevronDown,
    IconDots,
    IconEye,
    IconFileDiff,
    IconGitPullRequest,
    IconGitPullRequestClosed,
} from '@tabler/icons-react';
import { useContext, useState, type FC, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useGithubUserCredential } from '../../../../../../components/common/GithubIntegration/hooks/useGithubIntegration';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import { useFinishDiscardedWork } from '../../SemanticStudioAgent/useSemanticStudioChat';
import { isBitbucketPullRequest } from './pullRequestCardUtils';
import { QuietCardsContext } from './quietCards';
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
    /** Further menu items, shown under a divider. */
    children?: ReactNode;
}> = ({ projectUuid, prUrl, previewUrl, commitSha, children }) => {
    const [diffOpened, setDiffOpened] = useState(false);
    const quiet = useContext(QuietCardsContext);

    return (
        <>
            <Menu position={quiet ? 'bottom-end' : 'bottom-start'}>
                <Menu.Target>
                    {quiet ? (
                        <ActionIcon size="sm" aria-label="More">
                            <MantineIcon icon={IconDots} />
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
                    {children ? (
                        <>
                            <Menu.Divider />
                            {children}
                        </>
                    ) : null}
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

/** What the quiet card keeps in its menu for an open pull request: closing it, and authoring as the person. */
export const OpenPullRequestMenuItems: FC<{
    projectUuid: string;
    isGithub: boolean;
    onClose: (onClosed: () => void) => void;
}> = ({ projectUuid, isGithub, onClose }) => {
    const [armed, setArmed] = useState(false);
    // Discarded work leaves the list and stays as history, as it does from the bar.
    const finishDiscardedWork = useFinishDiscardedWork(projectUuid);
    const { data: credential } = useGithubUserCredential();
    return (
        <>
            <Menu.Item
                closeMenuOnClick={armed}
                leftSection={
                    <MantineIcon icon={IconGitPullRequestClosed} size={14} />
                }
                onClick={() =>
                    armed ? onClose(finishDiscardedWork) : setArmed(true)
                }
            >
                {armed
                    ? 'Click again to close the pull request'
                    : 'Discard changes'}
            </Menu.Item>
            {isGithub && credential === null ? (
                <Menu.Item
                    component={Link}
                    to="/generalSettings/profile"
                    leftSection={
                        <MantineIcon icon={IconBrandGithub} size={14} />
                    }
                >
                    Open pull requests as you
                </Menu.Item>
            ) : null}
        </>
    );
};
