import { ContentType } from '@lightdash/common';
import { type ModalProps } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useContentAction } from '../../../hooks/useContent';
import useApp from '../../../providers/App/useApp';
import MantineModal from '../MantineModal';

type Props = Pick<ModalProps, 'opened' | 'onClose'> & {
    projectUuid: string;
    uuid: string;
    name: string;
    onConfirm?: () => void;
};

const DocumentDeleteModal = ({
    opened,
    onClose,
    projectUuid,
    uuid,
    name,
    onConfirm,
}: Props) => {
    const { t } = useTranslation('modals');
    const { health } = useApp();
    const softDeleteEnabled = health.data?.softDelete.enabled ?? false;
    const { mutate: deleteDocument, isLoading } = useContentAction(
        projectUuid,
        {
            onSuccess: onConfirm,
        },
    );

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title={t('documentDelete.title')}
            variant="delete"
            resourceType={t('resourceTypes.document')}
            resourceLabel={name}
            description={
                softDeleteEnabled
                    ? t('documentDelete.softDeleteDescription')
                    : t('documentDelete.permanentDescription')
            }
            onConfirm={() =>
                deleteDocument({
                    action: { type: 'delete' },
                    item: { contentType: ContentType.DOCUMENT, uuid },
                })
            }
            confirmLoading={isLoading}
            cancelDisabled={isLoading}
        />
    );
};

export default DocumentDeleteModal;
