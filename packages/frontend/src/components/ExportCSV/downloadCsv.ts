export default function downloadCSV(url: string, filename?: string) {
    // Create a temporary anchor element
    const anchor = document.createElement('a');
    anchor.href = url;
    if (filename) {
        anchor.download = filename;
    }
    anchor.style.display = 'none';

    // Add the anchor to the DOM, trigger the click event, and remove it
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
}
