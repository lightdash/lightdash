import { type GroupWithMembers } from '@lightdash/common';
import { Button } from '@mantine/core';
import { IconKey } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import MantineModal, {
    type MantineModalProps,
} from '../../../components/common/MantineModal';

type RevokeProjectGroupAccessModalProps = Pick<MantineModalProps, 'onClose'> & {
    group: GroupWithMembers;
    onDelete: () => void;
};

const RevokeProjectGroupAccessModal: FC<RevokeProjectGroupAccessModalProps> = ({
    group,
    onDelete,
    onClose,
}) => {
    const { t } = useTranslation('roles');
    return (
        <MantineModal
            opened
            onClose={onClose}
            role="alertdialog"
            title={t('projectGroupAccess.revokeModal.title')}
            icon={IconKey}
            description={t('projectGroupAccess.revokeModal.description', {
                name: group.name,
            })}
            actions={
                <Button color="red" onClick={onDelete}>
                    {t('projectGroupAccess.revokeModal.revoke')}
                </Button>
            }
        />
    );
};

export default RevokeProjectGroupAccessModal;
