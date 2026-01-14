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
            variant="delete"
            resourceType="chart"
            resourceLabel={name}
            onConfirm={mutate}
            confirmLoading={isLoading}
        />
    );
};
