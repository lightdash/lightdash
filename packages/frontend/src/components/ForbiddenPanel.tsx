import { Anchor, Box } from '@mantine/core';
import { IconLock } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import { useOrganization } from '../hooks/organization/useOrganization';
import { Can } from '../providers/Ability';
import SuboptimalState from './common/SuboptimalState/SuboptimalState';

const ForbiddenPanel: FC<{ subject?: string }> = ({ subject }) => {
    const orgRequest = useOrganization();

    const createProjectLink = (
        <Can I="create" a={'Project'}>
            {(isAllowed) => {
                return (
                    isAllowed && (
                        <Anchor component={Link} to="/createProject">
                            Or create a new project.
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
                    title="Your organization doesn't have a project yet"
                    description={
                        <>
                            {' '}
                            <p>
                                A project connects Lightdash to your data. Ask
                                an organization admin to finish setting one up.
                            </p>
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
                title={`You don't have access${
                    subject ? ` to this ${subject}` : ''
                }`}
                description={
                    <>
                        {' '}
                        <p>Please contact the admin to request access.</p>
                        {createProjectLink}
                    </>
                }
                icon={IconLock}
            />
        </Box>
    );
};

export default ForbiddenPanel;
