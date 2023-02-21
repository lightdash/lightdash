import Color from 'colorjs.io';
import styled from 'styled-components';

interface ResourceIconBoxProps {
    color: string;
}

export const ResourceIconBox = styled.div<ResourceIconBoxProps>`
    width: 30px;
    height: 30px;

    display: flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;

    border-radius: 6px;

    background-color: ${(props) => {
        const color = new Color(props.color);
        color.alpha = 0.1;
        return color.toString();
    }};
`;
