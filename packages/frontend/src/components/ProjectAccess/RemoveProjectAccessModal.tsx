import { Button } from '@mantine/core';
import { IconKey } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { type ProjectUserWithRole } from '../../hooks/useProjectUsersWithRoles';
import MantineModal from '../common/MantineModal';

type Props = {
    user: Pick<ProjectUserWithRole, 'firstName' | 'lastName' | 'email'>;
    onDelete: () => void;
    onClose: () => void;
};

const RemoveProjectAccessModal: FC<Props> = ({ user, onDelete, onClose }) => {
    const { t } = useTranslation('roles');
    return (
        <MantineModal
            opened
            onClose={onClose}
            role="alertdialog"
            title={t('projectAccess.removeModal.title')}
            icon={IconKey}
            description={t('projectAccess.removeModal.description', {
                name:
                    user.firstName && user.lastName
                        ? `${user.firstName} ${user.lastName}`
                        : user.email,
            })}
            actions={
                <Button color="red" onClick={onDelete}>
                    {t('actions.delete', { ns: 'common' })}
                </Button>
            }
        />
    );
};

export default RemoveProjectAccessModal;
