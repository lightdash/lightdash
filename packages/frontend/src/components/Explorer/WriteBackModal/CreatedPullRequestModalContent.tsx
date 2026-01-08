import { Anchor, Button, Stack, Text } from '@mantine-8/core';
import { IconGitBranch } from '@tabler/icons-react';
import MantineModal from '../../common/MantineModal';

export const CreatedPullRequestModalContent = ({
    onClose,
    data,
}: {
    onClose: () => void;
    data: { prUrl: string };
}) => {
    return (
        <MantineModal
            size="auto"
            opened
            onClose={onClose}
            title="Write back to dbt"
            icon={IconGitBranch}
            actions={<Button onClick={onClose}>Close</Button>}
            modalRootProps={{
                onClick: (e) => e.stopPropagation(),
            }}
        >
            <Stack gap="md">
                <Text>
                    Your pull request{' '}
                    <Anchor href={data.prUrl} target="_blank" fw={700}>
                        #{data.prUrl.split('/').pop()}
                    </Anchor>{' '}
                    was successfully created on git.
                </Text>
                <Text>
                    Once it is merged, refresh your dbt connection to see your
                    updated metrics and dimensions.
                </Text>
            </Stack>
        </MantineModal>
    );
};
