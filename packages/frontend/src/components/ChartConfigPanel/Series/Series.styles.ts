import {
    Collapse,
    Colors,
    FormGroup,
    HTMLSelect,
    InputGroup,
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

export const InputWrapper = styled(FormGroup)`
    & label.bp4-label {
        font-weight: 500;
        display: inline-flex;
        gap: 0.214em;
    }
`;

export const GroupSeriesBlock = styled.div`
    ${FlexTemplate}
`;

export const GroupSeriesWrapper = styled.div`
    padding: 1em;
    margin-top: 0.714em;
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
        grid-template-columns: 2.143em auto;
        column-gap: 0.714em;
        align-items: end;
  `}
`;

export const SeriesTitle = styled.p`
    color: ${Colors.DARK_GRAY1};
    font-weight: 600;
    margin-bottom: 0.286em;
`;

export const SeriesMainInputs = styled.div<{ $isGrouped?: boolean }>`
    ${GridTemplate}

    ${({ $isGrouped }) =>
        $isGrouped &&
        `
        grid-template-columns: 2.143em 12.5em 2.143em 2.14em;
        column-gap: 0.357em;
  `}
`;

export const SeriesInputField = styled(InputGroup)`
    ${InputStyle}
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

export const Wrapper = styled.div`
    max-width: 28.571em;
    min-width: 25em;
    padding: 1.429em;
`;

export const ColorButton = styled.button`
    height: 2.143em;
    width: 2.143em;
    cursor: pointer;
    border: none;
    background-color: transparent;

    box-sizing: border-box;
    box-shadow: 0 0 0 0 rgb(19 124 189 / 0%), 0 0 0 0 rgb(19 124 189 / 0%),
        inset 0 0 0 1px rgb(16 22 26 / 15%), inset 0 1px 1px rgb(16 22 26 / 20%);
    border-radius: 0.214em;
    padding: 0.286em;
`;

export const ColorButtonInner = styled.div`
    height: 100%;
    width: 100%;
`;

export const SeriesDivider = styled.hr`
    height: 0.071em;
    width: 100%;
    background: ${Colors.LIGHT_GRAY2};
    border: none;
    margin: 1.857em 0;
`;
