import Color from 'colorjs.io';

export const readableColor = (backgroundColor: string) => {
    const onWhite = Math.abs(Color.contrastAPCA('white', backgroundColor));
    const onBlack = Math.abs(Color.contrastAPCA('black', backgroundColor));
    return onWhite > onBlack ? 'white' : 'black';
};
