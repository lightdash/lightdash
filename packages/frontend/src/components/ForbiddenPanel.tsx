import { Anchor, Box } from '@mantine/core';
import { IconLock } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useOrganization } from '../hooks/organization/useOrganization';
import { Can } from '../providers/Ability';
import SuboptimalState from './common/SuboptimalState/SuboptimalState';

const ForbiddenPanel: FC<{ subject?: string }> = ({ subject }) => {
    const { t } = useTranslation('app');
    const orgRequest = useOrganization();

    const createProjectLink = (
        <Can I="create" a={'Project'}>
            {(isAllowed) => {
                return (
                    isAllowed && (
                        <Anchor component={Link} to="/createProject">
                            {t('forbidden.createProject')}
                        </Anchor>
                    )
                );
            }}
        </Can>
    );

    if (orgRequest.isInitialLoading) {
        return (
            <Box mt="30vh">
                <SuboptimalState loading />
            </Box>
        );
    }

    if (orgRequest.data?.needsProject) {
        return (
            <Box mt="30vh">
                <SuboptimalState
                    title={t('forbidden.noProjectTitle')}
                    description={
                        <>
                            {' '}
                            <p>{t('forbidden.noProjectDescription')}</p>
                            {createProjectLink}
                        </>
                    }
                    icon={IconLock}
                />
            </Box>
        );
    }

    return (
        <Box mt="30vh">
            <SuboptimalState
                title={
                    subject
                        ? t('forbidden.noAccessTo', { subject })
                        : t('forbidden.noAccess')
                }
                description={
                    <>
                        {' '}
                        <p>{t('forbidden.contactAdmin')}</p>
                        {createProjectLink}
                    </>
                }
                icon={IconLock}
            />
        </Box>
    );
};

export default ForbiddenPanel;
