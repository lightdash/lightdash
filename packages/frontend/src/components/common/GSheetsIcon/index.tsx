import styled from 'styled-components';
import { ReactComponent as GsheetsFilledSvg } from '../../../svgs/google-sheets-filled.svg';
import { ReactComponent as GsheetsSvg } from '../../../svgs/google-sheets.svg';

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
