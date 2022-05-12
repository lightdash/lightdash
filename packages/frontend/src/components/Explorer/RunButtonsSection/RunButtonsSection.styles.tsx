import styled from 'styled-components';

export const Wrapper = styled.div<{ $isViewMode: boolean }>`
    height: 60px;
    display: flex;
    justify-content: ${($isViewMode) =>
        !$isViewMode ? 'space-between' : 'flex-end'};
    align-items: center;
    button {
        margin: 0;
    }
`;
