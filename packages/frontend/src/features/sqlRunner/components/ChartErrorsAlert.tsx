import {
    Alert,
    Button,
    Modal,
    Stack,
    Text,
    type ModalProps,
} from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';

type Props = ModalProps & {
    onFixButtonClick: () => void;
};

export const ChartErrorsAlert: FC<Props> = ({
    opened,
    onClose,
    onFixButtonClick,
}) => {
    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title={null}
            p={0}
            styles={{
                header: {
                    display: 'none',
                },
                body: {
                    padding: 0,
                },
            }}
        >
            <Alert
                icon={<MantineIcon icon={IconAlertCircle} color="red" />}
                color="red"
                title="Fix errors before saving"
            >
                <Stack spacing="xs">
                    <Text fw={500} size="xs">
                        You have errors in your chart configuration. Please fix
                        the errors and try again.
                    </Text>
                    <Button
                        ml="auto"
                        size="xs"
                        variant="default"
                        onClick={onFixButtonClick}
                    >
                        Fix errors
                    </Button>
                </Stack>
            </Alert>
        </Modal>
    );
};
