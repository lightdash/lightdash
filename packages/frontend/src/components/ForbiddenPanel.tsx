import { NonIdealState } from '@blueprintjs/core';
import { FC } from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import { Can } from './common/Authorization';

const ForbiddenPanelWrapper = styled.div`
    margin-top: 30vh;
`;

const ForbiddenPanel: FC<{ subject?: string }> = ({ subject }) => {
    return (
        <ForbiddenPanelWrapper>
            <NonIdealState
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
                                        <Link to="/createProject">
                                            Or create a new project.
                                        </Link>
                                    )
                                );
                            }}
                        </Can>
                    </>
                }
                icon="lock"
            />
        </ForbiddenPanelWrapper>
    );
};

export default ForbiddenPanel;
