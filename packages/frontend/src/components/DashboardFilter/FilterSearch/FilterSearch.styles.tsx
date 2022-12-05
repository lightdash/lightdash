import styled from 'styled-components';

interface FilterModalContainerProps {
    $wide?: boolean;
}

export const FilterModalContainer = styled.div<FilterModalContainerProps>`
    padding: 20px;
    width: ${({ $wide }) => ($wide ? '500px' : '350px')};
`;
