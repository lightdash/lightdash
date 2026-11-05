import {
    type ContentAsCodeReleasableType,
    type ContentAsCodeRepositorySource,
} from '@lightdash/common';
import { Anchor, Group, Stack, Text } from '@mantine/core';
import { IconGitBranch } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import InfoRow from '../../../components/common/PageHeader/InfoRow';
import {
    useCanManageContentAsCode,
    useReleaseContentAsCodeSnapshot,
} from '../hooks/useReleaseContentAsCodeSnapshot';
import styles from './ManagedFromRepositoryRow.module.css';

type Props = {
    projectUuid: string | undefined;
    contentType: ContentAsCodeReleasableType;
    slug: string;
    source: ContentAsCodeRepositorySource;
};

// Shown in the info popups of Git-managed content, so nobody needs a DB
// query to learn why their saves turn into drafts.
const ManagedFromRepositoryRow: FC<Props> = ({
    projectUuid,
    contentType,
    slug,
    source,
}) => {
    const canManage = useCanManageContentAsCode(projectUuid);
    const release = useReleaseContentAsCodeSnapshot(
        projectUuid,
        contentType,
        slug,
    );
    const [confirming, setConfirming] = useState(false);

    return (
        <Stack gap={4}>
            <InfoRow icon={IconGitBranch} label="Source">
                Repository
            </InfoRow>
            {source.filePath ? (
                <Text
                    fz="xs"
                    c="dimmed"
                    ff="monospace"
                    className={styles.filePath}
                >
                    {source.filePath}
                </Text>
            ) : (
                <Text fz="xs" c="dimmed">
                    Not linked to a file in the repository
                </Text>
            )}
            {canManage &&
                (confirming ? (
                    <Stack gap={4}>
                        <Text fz="xs" c="dimmed">
                            {source.filePath
                                ? 'The file is still in the repository, so the next upload manages this again and replaces edits made here. Delete the file to stop managing it for good.'
                                : 'Saves here will publish directly. Open drafts on this are dismissed.'}
                        </Text>
                        <Group gap="sm">
                            <Anchor
                                component="button"
                                fz="xs"
                                fw={500}
                                c="red"
                                disabled={release.isLoading}
                                onClick={() => release.mutate()}
                            >
                                {source.filePath ? 'Release anyway' : 'Release'}
                            </Anchor>
                            <Anchor
                                component="button"
                                fz="xs"
                                c="dimmed"
                                onClick={() => setConfirming(false)}
                            >
                                Cancel
                            </Anchor>
                        </Group>
                    </Stack>
                ) : (
                    <Anchor
                        component="button"
                        fz="xs"
                        fw={500}
                        ta="left"
                        onClick={() => setConfirming(true)}
                    >
                        Stop managing from the repository
                    </Anchor>
                ))}
        </Stack>
    );
};

export default ManagedFromRepositoryRow;
