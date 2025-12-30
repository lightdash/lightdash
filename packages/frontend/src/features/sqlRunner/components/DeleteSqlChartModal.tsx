import { Button, Text } from '@mantine-8/core';
import { IconChartBar } from '@tabler/icons-react';
import { useEffect, type FC } from 'react';
import MantineModal, {
    type MantineModalProps,
} from '../../../components/common/MantineModal';
import { useDeleteSqlChartMutation } from '../hooks/useSavedSqlCharts';

type Props = Pick<MantineModalProps, 'opened' | 'onClose'> & {
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
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Delete chart"
            icon={IconChartBar}
            actions={
                <Button
                    loading={isLoading}
                    color="red"
                    onClick={() => mutate()}
                >
                    Delete
                </Button>
            }
        >
            <Text>
                Are you sure you want to delete the chart{' '}
                <Text span fw={600}>
                    "{name}"
                </Text>
                ?
            </Text>
        </MantineModal>
    );
};
