import { useEffect, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import MantineModal, {
    type MantineModalProps,
} from '../../../components/common/MantineModal';
import useApp from '../../../providers/App/useApp';
import DocumentsLinkingChartCallout from '../../documents/DocumentsLinkingChartCallout';
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
    const { t } = useTranslation('sqlRunner');
    const { health } = useApp();
    const softDeleteEnabled = health.data?.softDelete.enabled;
    const retentionDays = health.data?.softDelete.retentionDays;

    const { mutate, isLoading, isSuccess } = useDeleteSqlChartMutation(
        projectUuid,
        savedSqlUuid,
    );

    useEffect(() => {
        if (isSuccess) {
            onSuccess();
        }
    }, [isSuccess, onClose, onSuccess]);

    const description = softDeleteEnabled
        ? t('deleteModal.softDeleteDescription', { count: retentionDays })
        : undefined;

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title={t('deleteModal.title')}
            variant="delete"
            resourceType="chart"
            resourceLabel={name}
            description={description}
            onConfirm={mutate}
            confirmLoading={isLoading}
            cancelDisabled={isLoading}
        >
            <DocumentsLinkingChartCallout
                projectUuid={projectUuid}
                kind="sqlChart"
                chartUuid={savedSqlUuid}
                softDeleteEnabled={!!softDeleteEnabled}
            />
        </MantineModal>
    );
};
