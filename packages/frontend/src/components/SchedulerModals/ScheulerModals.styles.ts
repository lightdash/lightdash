import styled from 'styled-components';
import { ReactComponent as SlackSvg } from '../../svgs/slack.svg';

export const SlackIcon = styled(SlackSvg)`
    width: 20px;
    height: 20px;
    margin: 5px;
`;

export const TargetRow = styled.div`
    display: flex;
    align-items: flex-start;
    gap: 5px;

    .bp4-form-group {
        margin-bottom: 0;
        flex: 1;
    }
`;
