import styled from 'styled-components';

import Form from '../ReactHookForm/Form';

const CARD_GAP = 20;

export const FormContainer = styled(Form)`
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: ${CARD_GAP}px;
    width: 100%;
`;
