import { Anchor, Box } from '@mantine/core';
import { IconLock } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router-dom';
import { Can } from './common/Authorization';
import SuboptimalState from './common/SuboptimalState/SuboptimalState';

const ForbiddenPanel: FC<{ subject?: string }> = ({ subject }) => {
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
                        <Can I="create" a={'Project'}>
                            {(isAllowed) => {
                                return (
                                    isAllowed && (
                                        <Anchor
                                            component={Link}
                                            to="/createProject"
                                        >
                                            Or create a new project.
                                        </Anchor>
                                    )
                                );
                            }}
                        </Can>
                    </>
                }
                icon={IconLock}
            />
        </Box>
    );
};

export default ForbiddenPanel;
