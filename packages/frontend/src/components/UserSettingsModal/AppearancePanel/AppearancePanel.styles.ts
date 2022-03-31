import styled from 'styled-components';

export const AppearancePanelWrapper = styled.div`
    height: 100%;
    display: flex;
    flex-direction: column;
`;

export const Title = styled.div``;
export const ColorPalette = styled.div`
    display: flex;
    flex-wrap: wrap;
`;

export const AppearanceColorWrapper = styled.div`
    margin: 0.625em 0.313em;
`;
export const ColorLabel = styled.input`
    background-color: white;
    padding: 0.313em;
    border: 1px solid lightgray;
    border-radius: 0 5px 5px 0px;
    width: 5em;
`;
