import {
    Collapse,
    Colors,
    FormGroup,
    HTMLSelect,
    Icon,
} from '@blueprintjs/core';
import styled, { css } from 'styled-components';

const InputStyle = css`
    background: ${Colors.WHITE};
    border: 0.7px solid ${Colors.LIGHT_GRAY1};
    box-sizing: border-box;
    box-shadow: inset 0px 1px 1px rgba(16, 22, 26, 0.2);
`;

const GridTemplate = css`
    display: grid;
    grid-template-columns: 2.143em auto;
    column-gap: 0.714em;
`;

const FlexTemplate = css`
    display: flex;
    flex-direction: column;
`;

export const GroupSeriesBlock = styled.div`
    ${FlexTemplate}
`;

export const GroupSeriesWrapper = styled.div`
    padding: 5px;
    background: ${Colors.LIGHT_GRAY5};
    border-radius: 0.286em;
`;

export const GroupedSeriesConfigWrapper = styled.div`
    margin-bottom: 0.357em;
`;

export const GroupSeriesInputs = styled.div`
    display: flex;
    flex: 1;
    gap: 0.714em;
    justify-content: space-between;
    margin-bottom: 0.714em;
`;

export const SeriesBlock = styled.div`
    display: flex;
    flex-direction: column;
`;

export const SeriesWrapper = styled.div<{ $isSingle?: boolean }>`
    ${FlexTemplate}
    &:last-child {
        margin-bottom: 0;
    }

    ${({ $isSingle }) =>
        $isSingle &&
        `
        display: grid;
        grid-template-columns: auto auto;
  `}
`;

export const SeriesTitle = styled.p`
    color: ${Colors.DARK_GRAY1};
    font-weight: 600;
    margin-bottom: 0.286em;
`;

export const DragIcon = styled(Icon)`
    margin-top: 6px;
`;

export const SeriesExtraInputs = styled.div`
    display: flex;
    flex: 1;
    gap: 0.714em;
    margin-top: 0.357em;
    justify-content: space-between;
`;

// Read more at https://github.com/palantir/blueprint/issues/5387
// @ts-ignore
export const SeriesOptionsWrapper = styled(Collapse)<{
    $isGrouped?: boolean;
    $isSingle?: boolean;
}>`
    ${GridTemplate}
    .bp4-collapse-body {
        grid-column: 2 !important;
    }

    ${({ $isGrouped }) =>
        $isGrouped &&
        `
        gap: 0.357em;
  `}

    ${({ $isSingle }) =>
        $isSingle &&
        `
        display: grid;
        grid-template-columns: auto;
  `}
`;
export const SeriesExtraInputWrapper = styled(FormGroup)`
    margin: 0;

    & label.bp4-label {
        font-weight: 600;
        display: inline-flex;
        gap: 0.214em;
        color: ${Colors.GRAY1};
        font-size: 0.857em;
    }
`;

export const SeriesExtraSelect = styled(HTMLSelect)`
    select {
        ${InputStyle}
    }
`;

export const SeriesDivider = styled.hr`
    height: 0.071em;
    width: 100%;
    background: ${Colors.LIGHT_GRAY2};
    border: none;
    margin: 1.857em 0;
`;
