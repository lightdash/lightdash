import styled from 'styled-components';
import GsheetsFilledSvg from '../../../svgs/google-sheets-filled.svg?react';
import GsheetsSvg from '../../../svgs/google-sheets.svg?react';

export const GSheetsIcon = styled(GsheetsSvg)`
    width: 16px;
    height: 16px;
`;

export const GSheetsIconFilled = styled(GsheetsFilledSvg)`
    width: 16px;
    height: 16px;
    & path {
        stroke-width: 4;
    }
`;
