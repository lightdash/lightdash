import Color from 'colorjs.io';

const IS_HEX_CODE_COLOR_REGEX = /^#([a-fA-F0-9]{3}|[a-fA-F0-9]{6})$/;
export const isHexCodeColor = (color: string): boolean => {
    return IS_HEX_CODE_COLOR_REGEX.test(color);
};
export const readableColor = (backgroundColor: string) => {
    if (!isHexCodeColor(backgroundColor)) {
        return 'black';
    }
    const onWhite = Math.abs(Color.contrastAPCA('white', backgroundColor));
    const onBlack = Math.abs(Color.contrastAPCA('black', backgroundColor));
    return onWhite > onBlack ? 'white' : 'black';
};
