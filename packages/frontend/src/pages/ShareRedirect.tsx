import { NonIdealState, Spinner } from '@blueprintjs/core';
import { FC, useEffect } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import styled from 'styled-components';
import { useGetShare } from '../hooks/useShare';

export const SharePanel = styled.div`
    margin-top: 50px;
`;

<div style={{ padding: '50px 0' }}></div>;
const ShareRedirect: FC = () => {
    const { shareNanoid } = useParams<{ shareNanoid: string }>();
    const { data, error } = useGetShare(shareNanoid);
    const history = useHistory();

    useEffect(() => {
        if (data && data.url) {
            history.push(data.url);
        }
    }, [data, history]);

    if (error) {
        return (
            <SharePanel>
                <NonIdealState
                    title={`Shared link does not exist`}
                    icon="backlink"
                />
            </SharePanel>
        );
    }
    return (
        <SharePanel>
            <NonIdealState title="Loading..." icon={<Spinner />} />
        </SharePanel>
    );
};

export default ShareRedirect;
