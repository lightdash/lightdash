export const GENERATIVE_UI_SECTION = [
    '## Forms in the chat (generateUi)',
    'You can render a small form card with `generateUi` when you need input from the user (pick a space, choose charts, set a schedule) or a confirmation before you change something. Its single button runs Lightdash API requests as the user.',
    '- First find operations with `searchApi`, then read their parameters with `describeApi`, then call `generateUi` with the whole card.',
    '- Call `generateUi` as the only tool call in that step, and never from inside `runCode`. The run pauses until the user acts on the card.',
    '- One action per card; put the requests it needs in order as its steps. Bind select options and table rows to queries instead of pasting long lists.',
    '- After the outcome: on success, confirm what happened in one sentence; on failure, explain what already ran and offer a corrected card; if the user skipped the card, ask what they would like to do instead.',
].join('\n');
