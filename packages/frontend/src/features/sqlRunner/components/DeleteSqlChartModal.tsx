import { useEffect, type FC } from 'react';
import MantineModal, {
    type MantineModalProps,
} from '../../../components/common/MantineModal';
import { useSavedQueryDeleteMutation } from '../../../hooks/useSavedQuery';
import useApp from '../../../providers/App/useApp';
import DocumentsLinkingChartCallout from '../../documents/DocumentsLinkingChartCallout';

type Props = Pick<MantineModalProps, 'opened' | 'onClose'> & {
    projectUuid: string;
    chartUuid: string;
    name: string;
    onSuccess: () => void;
};

export const DeleteSqlChartModal: FC<Props> = ({
    projectUuid,
    chartUuid,
    name,
    opened,
    onClose,
    onSuccess,
}) => {
    const { health } = useApp();
    const softDeleteEnabled = health.data?.softDelete.enabled;
    const retentionDays = health.data?.softDelete.retentionDays;

    const { mutate, isLoading, isSuccess } =
        useSavedQueryDeleteMutation(projectUuid);

    useEffect(() => {
        if (isSuccess) {
            onSuccess();
        }
    }, [isSuccess, onClose, onSuccess]);

    const description = softDeleteEnabled
        ? `This chart will be moved to Recently deleted and permanently removed after ${retentionDays} days.`
        : undefined;

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Delete chart"
            variant="delete"
            resourceType="chart"
            resourceLabel={name}
            description={description}
            onConfirm={() => mutate(chartUuid)}
            confirmLoading={isLoading}
            cancelDisabled={isLoading}
        >
            <DocumentsLinkingChartCallout
                projectUuid={projectUuid}
                kind="chart"
                chartUuid={chartUuid}
                softDeleteEnabled={!!softDeleteEnabled}
            />
        </MantineModal>
    );
};
