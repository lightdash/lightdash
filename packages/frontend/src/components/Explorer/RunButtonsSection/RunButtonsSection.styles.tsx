import styled from 'styled-components';

export const Wrapper = styled.div<{ $isViewMode: boolean }>`
    height: 60px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    button {
        margin: 0;
    }

    ${({ $isViewMode }) =>
        $isViewMode &&
        `
        justify-content: flex-end;
  `}
`;
