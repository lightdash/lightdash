// jsdom has no layout, so it does not implement the hit testing that
// elementsFromPoint does: nothing is ever on top of anything else.
function mockElementsFromPoint() {
    window.Document.prototype.elementsFromPoint = () => [];
}

export default mockElementsFromPoint;
