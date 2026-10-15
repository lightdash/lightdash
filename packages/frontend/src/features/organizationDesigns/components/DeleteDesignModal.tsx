import { type ApiOrganizationDesign } from '@lightdash/common';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import MantineModal from '../../../components/common/MantineModal';

type Props = {
    design: ApiOrganizationDesign | null;
    opened: boolean;
    isDeleting: boolean;
    onClose: () => void;
    onConfirm: () => void;
};

export const DeleteDesignModal: FC<Props> = ({
    design,
    opened,
    isDeleting,
    onClose,
    onConfirm,
}) => {
    const { t } = useTranslation('settings');
    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            variant="delete"
            title={t('designs.delete.title')}
            resourceType={t('designs.delete.resourceType')}
            resourceLabel={design?.name}
            size="md"
            onConfirm={onConfirm}
            confirmLoading={isDeleting}
        >
            {design && design.files.length > 0 && (
                <span>
                    {t('designs.delete.filesWarning', {
                        count: design.files.length,
                    })}
                </span>
            )}
        </MantineModal>
    );
};
