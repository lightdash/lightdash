#! /usr/bin/env node

if (!process.env.npm_execpath.match(/pnpm/)) {
    console.log(
        `\x1b[31m%s\x1b[0m`,
        `
╔═════════════════════════════════════════════════════╗
║                                                     ║
║    Only PNPM is allowed to install dependencies!    ║
║                                                     ║
╚═════════════════════════════════════════════════════╝
`,
    );

    process.exit(1);
}
