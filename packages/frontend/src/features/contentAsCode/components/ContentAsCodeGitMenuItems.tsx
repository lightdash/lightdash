import { type ContentAsCodeSnapshotType } from '@lightdash/common';
import { Menu } from '@mantine/core';
import { IconGitPullRequest, IconPlus } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import {
    useCanProposeContentAsCode,
    useContentAsCodeWriteBackStatus,
    useProposeContentAsCode,
} from '../hooks/useContentAsCodeWriteBack';

type Props = {
    project?: { organizationUuid: string; projectUuid: string };
    contentType: ContentAsCodeSnapshotType;
    slug?: string;
};

const ContentAsCodeGitMenuItems: FC<Props> = ({
    project,
    contentType,
    slug,
}) => {
    const canPropose = useCanProposeContentAsCode(project);
    const statusQuery = useContentAsCodeWriteBackStatus(
        project?.projectUuid,
        contentType,
        slug,
        canPropose,
    );
    const propose = useProposeContentAsCode(
        project?.projectUuid,
        contentType,
        slug,
    );

    const status = statusQuery.data;
    if (!canPropose || !status || status.state === 'unavailable') {
        return null;
    }

    if (status.writeBack.prState === 'merged') {
        return (
            <Menu.Item disabled>Merged, applies on the next deploy</Menu.Item>
        );
    }

    const isAddToGit = status.state === 'ui_only';
    const canProposeNow = status.state !== 'in_sync';

    return (
        <>
            {status.writeBack.prState === 'open' && status.writeBack.prUrl ? (
                <Menu.Item
                    leftSection={<MantineIcon icon={IconGitPullRequest} />}
                    component="a"
                    href={status.writeBack.prUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    Open pull request
                </Menu.Item>
            ) : null}
            {canProposeNow ? (
                <Menu.Item
                    leftSection={
                        <MantineIcon
                            icon={isAddToGit ? IconPlus : IconGitPullRequest}
                        />
                    }
                    disabled={propose.isLoading || !slug}
                    onClick={() => propose.mutate()}
                >
                    {isAddToGit ? 'Add to git' : 'Propose to git'}
                </Menu.Item>
            ) : null}
        </>
    );
};

export default ContentAsCodeGitMenuItems;
