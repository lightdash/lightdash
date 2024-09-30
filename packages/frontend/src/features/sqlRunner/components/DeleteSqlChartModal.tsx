import {
    Button,
    Group,
    Modal,
    Stack,
    Text,
    type ModalProps,
} from '@mantine/core';
import { IconChartBar } from '@tabler/icons-react';
import { useEffect, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useDeleteSqlChartMutation } from '../hooks/useSavedSqlCharts';

type Props = Pick<ModalProps, 'opened' | 'onClose'> & {
    projectUuid: string;
    savedSqlUuid: string;
    name: string;
    onSuccess: () => void;
};

export const DeleteSqlChartModal: FC<Props> = ({
    projectUuid,
    savedSqlUuid,
    name,
    opened,
    onClose,
    onSuccess,
}) => {
    const { mutate, isLoading, isSuccess } = useDeleteSqlChartMutation(
        projectUuid,
        savedSqlUuid,
    );

    useEffect(() => {
        if (isSuccess) {
            onSuccess();
        }
    }, [isSuccess, onClose, onSuccess]);

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            keepMounted={false}
            title={
                <Group spacing="xs">
                    <MantineIcon icon={IconChartBar} size="lg" color="gray.7" />
                    <Text fw={500}>Delete chart</Text>
                </Group>
            }
            styles={(theme) => ({
                header: { borderBottom: `1px solid ${theme.colors.gray[4]}` },
            })}
        >
            <Stack pt="sm">
                <Text>
                    Are you sure you want to delete the chart{' '}
                    <Text span fw={600}>
                        "{name}"
                    </Text>
                    ?
                </Text>

                <Group position="right" mt="sm">
                    <Button color="dark" variant="outline" onClick={onClose}>
                        Cancel
                    </Button>

                    <Button
                        loading={isLoading}
                        color="red"
                        onClick={() => mutate()}
                    >
                        Delete
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
};
