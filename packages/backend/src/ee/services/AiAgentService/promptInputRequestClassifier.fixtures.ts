export const promptInputRequestClassifierEvalCases = [
    {
        name: 'asks which project',
        response: 'I found several projects. Which project did you mean?',
        blocking: true,
        gateFired: true,
    },
    {
        name: 'asks for metric clarification',
        response: 'Could you clarify which revenue metric you want?',
        blocking: true,
        gateFired: true,
    },
    {
        name: 'asks which explore',
        response:
            'I found the Orders and Invoices explores. Which one should I use?',
        blocking: true,
        gateFired: true,
    },
    {
        name: 'asks for a date range',
        response: 'What date range should I use?',
        blocking: true,
        gateFired: true,
    },
    {
        name: 'asks gross or net',
        response: 'Did you mean gross revenue or net revenue?',
        blocking: true,
        gateFired: true,
    },
    {
        name: 'asks which workspace',
        response: 'Let me know which workspace you want me to query.',
        blocking: true,
        gateFired: true,
    },
    {
        name: 'asks what to compare',
        response: 'What would you like me to compare against last quarter?',
        blocking: true,
        gateFired: true,
    },
    {
        name: 'asks which region',
        response:
            'There are three matching regions. Which of these should I use?',
        blocking: true,
        gateFired: true,
    },
    {
        name: 'asks which customer field',
        response: 'The model has two customer identifiers. Could you clarify?',
        blocking: true,
        gateFired: true,
    },
    {
        name: 'asks which source',
        response: 'Should I use orders or invoices?',
        blocking: true,
        gateFired: true,
    },
    {
        name: 'asks for a business definition',
        response: 'What does active customer mean here?',
        blocking: true,
        gateFired: true,
    },
    {
        name: 'requires a choice',
        response: 'I cannot continue until you choose a dataset. Which one?',
        blocking: true,
        gateFired: true,
    },
    {
        name: 'offers a chart',
        response: 'Revenue increased by 12%. Want a chart of that too?',
        blocking: false,
        gateFired: true,
    },
    {
        name: 'offers a regional breakdown',
        response:
            'The total is £1.2m. Would you like me to break it down by region?',
        blocking: false,
        gateFired: true,
    },
    {
        name: 'checks whether the answer helped',
        response:
            'The decline came from enterprise accounts. Does that answer your question?',
        blocking: false,
        gateFired: true,
    },
    {
        name: 'offers more help',
        response: 'The dashboard is ready. Anything else?',
        blocking: false,
        gateFired: true,
    },
    {
        name: 'refuses inaccessible data',
        response: "I can't access that data.",
        blocking: false,
        gateFired: false,
    },
    {
        name: 'refuses an unsafe request',
        response:
            "I can't help with that request, but I can explain the available metrics.",
        blocking: false,
        gateFired: false,
    },
    {
        name: 'answers with a complete summary',
        response: 'Revenue increased by 12% year over year.',
        blocking: false,
        gateFired: false,
    },
    {
        name: 'answers with a complete comparison',
        response: 'Enterprise grew while self-serve remained flat.',
        blocking: false,
        gateFired: false,
    },
    {
        name: 'answers with a number',
        response: 'The result is 42.',
        blocking: false,
        gateFired: false,
    },
    {
        name: 'reports a missing metric',
        response: "I couldn't find that metric in this dataset.",
        blocking: false,
        gateFired: false,
    },
    {
        name: 'reports no matching rows',
        response: 'No matching rows were found.',
        blocking: false,
        gateFired: false,
    },
    {
        name: 'delivers a chart',
        response: 'Revenue grew 12%; the chart is attached.',
        blocking: false,
        gateFired: false,
    },
] as const;
