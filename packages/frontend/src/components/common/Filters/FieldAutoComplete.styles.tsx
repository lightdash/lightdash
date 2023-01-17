import styled from 'styled-components';

export const FieldAutoCompleteWrapper = styled.div`
    display: grid;
    grid-template-rows: 30px;
    grid-template-columns: 1fr 150px 1fr 30px;
    grid-gap: 10px;
    padding-left: 60px;
    button {
        grid-column: 4/5;
    }
`;
