import { Button, Flex, Text } from '@mantine/core';
import { IconSend } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineModal from '../../../components/common/MantineModal';

type ConfirmSendNowModalProps = {
    opened: boolean;
    schedulerName: string;
    loading?: boolean;
    onClose: () => void;
    onConfirm: () => void;
};

const ConfirmSendNowModal: FC<ConfirmSendNowModalProps> = ({
    opened,
    schedulerName,
    loading,
    onClose,
    onConfirm,
}) => {
    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title={`Send “${schedulerName}” now?`}
            icon={IconSend}
            size="xl"
            actions={
                <Flex gap="sm">
                    <Button variant="default" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={onConfirm} loading={loading}>
                        Send now
                    </Button>
                </Flex>
            }
        >
            <Text>
                This will trigger the scheduled delivery immediately. It will
                not change or affect the configured schedule or future
                deliveries.
            </Text>
        </MantineModal>
    );
};

export default ConfirmSendNowModal;
