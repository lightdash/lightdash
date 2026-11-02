import { type ContentAsCodeReleasableType } from '@lightdash/common';
import { Anchor } from '@mantine/core';
import { IconGitBranch } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import InfoRow from '../../../components/common/PageHeader/InfoRow';
import {
    useCanManageContentAsCode,
    useReleaseContentAsCodeSnapshot,
} from '../hooks/useReleaseContentAsCodeSnapshot';

type Props = {
    projectUuid: string | undefined;
    contentType: ContentAsCodeReleasableType;
    slug: string;
};

// Shown in the info popups of Git-managed content, so nobody needs a DB
// query to learn why their saves turn into drafts.
const ManagedFromRepositoryRow: FC<Props> = ({
    projectUuid,
    contentType,
    slug,
}) => {
    const canManage = useCanManageContentAsCode(projectUuid);
    const release = useReleaseContentAsCodeSnapshot(
        projectUuid,
        contentType,
        slug,
    );
    const [confirming, setConfirming] = useState(false);

    return (
        <InfoRow icon={IconGitBranch} label="Source">
            Managed from repository
            {canManage && (
                <>
                    {' · '}
                    <Anchor
                        component="button"
                        fz="xs"
                        fw={500}
                        disabled={release.isLoading}
                        onClick={() => {
                            if (!confirming) {
                                setConfirming(true);
                                return;
                            }
                            release.mutate();
                        }}
                    >
                        {confirming
                            ? 'Confirm: open drafts are dismissed'
                            : 'Release'}
                    </Anchor>
                </>
            )}
        </InfoRow>
    );
};

export default ManagedFromRepositoryRow;
