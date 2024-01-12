import { Anchor } from '@mantine/core';
import { IconLock } from '@tabler/icons-react';
import { FC } from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import { Can } from './common/Authorization';
import SuboptimalState from './common/SuboptimalState/SuboptimalState';

const ForbiddenPanelWrapper = styled.div`
    margin-top: 30vh;
`;

const ForbiddenPanel: FC<{ subject?: string }> = ({ subject }) => {
    return (
        <ForbiddenPanelWrapper>
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
        </ForbiddenPanelWrapper>
    );
};

export default ForbiddenPanel;
