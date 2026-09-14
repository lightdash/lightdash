import { Alert, Button, Group, Text } from '@mantine/core';
import { IconRestore } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';

type DismissedDraftAlertProps = {
    isReopening: boolean;
    onReopen: () => void;
};

const DismissedDraftAlert: FC<DismissedDraftAlertProps> = ({
    isReopening,
    onReopen,
}) => (
    <Alert
        color="blue"
        icon={<MantineIcon icon={IconRestore} />}
        title="Your dismissed draft is still available"
        mx="md"
        mt="md"
    >
        <Group justify="space-between" wrap="nowrap">
            <Text size="sm">
                Reopen it to continue editing and send it back for review.
            </Text>
            <Button
                size="xs"
                variant="light"
                loading={isReopening}
                onClick={onReopen}
            >
                Reopen draft
            </Button>
        </Group>
    </Alert>
);

export default DismissedDraftAlert;
