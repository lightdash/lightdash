import { Group, Loader, Stack, Text } from '@mantine-8/core';
import { IconGitPullRequest } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineModal from '../../../../../components/common/MantineModal';
import {
    useAiAgentReviewItemWritebackPreview,
    useCreateAiAgentReviewItemWriteback,
} from '../../hooks/useAiAgentAdmin';
import { ProjectContextDiffPreview } from './ProjectContextDiffPreview';

type ProjectContextWritebackModalProps = {
    fingerprint: string;
    opened: boolean;
    onClose: () => void;
};

export const ProjectContextWritebackModal: FC<
    ProjectContextWritebackModalProps
> = ({ fingerprint, opened, onClose }) => {
    const preview = useAiAgentReviewItemWritebackPreview(fingerprint, {
        enabled: opened,
    });
    const createWriteback = useCreateAiAgentReviewItemWriteback();

    const { data } = preview;
    const canConfirm = data?.available === true;

    const handleConfirm = () => {
        createWriteback.mutate(fingerprint, { onSuccess: () => onClose() });
    };

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Open project context PR"
            icon={IconGitPullRequest}
            size="80vw"
            onConfirm={canConfirm ? handleConfirm : undefined}
            confirmLabel="Looks good, open PR"
            confirmLoading={createWriteback.isLoading}
            cancelLabel="Cancel"
            bodyScrollAreaMaxHeight="calc(80vh - 160px)"
        >
            <Stack gap="sm">
                {preview.isLoading && (
                    <Group gap="xs">
                        <Loader size="xs" color="gray" type="dots" />
                        <Text fz="sm" c="ldGray.6">
                            Computing the change…
                        </Text>
                    </Group>
                )}

                {preview.isError && (
                    <Text fz="sm" c="red">
                        Couldn&rsquo;t compute the change preview. You can still
                        open the PR and review it on GitHub.
                    </Text>
                )}

                {data?.available === true && (
                    <ProjectContextDiffPreview
                        fileName={data.fileName}
                        before={data.before}
                        after={data.after}
                    />
                )}

                {data?.available === false && (
                    <Text fz="sm" c="ldGray.6">
                        This change runs in a sandbox — the diff will be on the
                        pull request itself.
                    </Text>
                )}
            </Stack>
        </MantineModal>
    );
};
