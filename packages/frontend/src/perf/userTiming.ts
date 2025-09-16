const marks = {
    fieldSelect: 'fieldClick:start',
    results: 'resultsTable:render',
    measure: 'fieldClick->resultsTable',
};

export function markFieldClickStart() {
    performance.mark(marks.fieldSelect);
}

export function markResultsTableRender() {
    performance.mark(marks.results);
    try {
        performance.measure(marks.measure, marks.fieldSelect, marks.results);
    } catch {}
}
