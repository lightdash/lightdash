import styled from 'styled-components';

export const ConfigureFilterWrapper = styled.div`
    height: 100%;
    display: flex;
    flex-direction: column;
`;

export const Title = styled.span`
    font-weight: bold;
`;

export const InputsWrapper = styled.div`
    display: flex;
    gap: 1.071em;
    flex-direction: column;

    select {
        width: 100% !important;
    }
`;
