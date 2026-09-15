import { ContentType } from '@lightdash/common';
import { type ModalProps } from '@mantine/core';
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
            title="Delete document"
            variant="delete"
            resourceType="document"
            resourceLabel={name}
            description={
                softDeleteEnabled
                    ? 'This document will be moved to Recently deleted, where it can be restored or permanently deleted.'
                    : 'This document and all of its versions will be permanently deleted.'
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
