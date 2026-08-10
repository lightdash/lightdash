// jsdom doesn't implement scrollIntoView, which Mantine's Combobox calls when
// highlighting an option.
function mockScrollIntoView() {
    window.Element.prototype.scrollIntoView = () => {};
}

export default mockScrollIntoView;
