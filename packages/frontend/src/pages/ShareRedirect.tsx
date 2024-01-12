import { IconLinkOff } from '@tabler/icons-react';
import { FC, useEffect } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import styled from 'styled-components';
import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
import { useGetShare } from '../hooks/useShare';

const SharePanel = styled.div`
    margin-top: 50px;
`;

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
                <SuboptimalState
                    title={`Shared link does not exist`}
                    icon={IconLinkOff}
                />
            </SharePanel>
        );
    }
    return (
        <SharePanel>
            <SuboptimalState title="Loading..." loading />
        </SharePanel>
    );
};

export default ShareRedirect;
