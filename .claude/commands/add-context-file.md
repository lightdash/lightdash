Add a CLAUDE.md context file in the directory $ARGUMENTS

<format>
Use XML tags for sections instead of markdown headers
Allowed tags: <summary>, <howToUse>, <codeExample>, <links>, <importantToKnow>
code blocks can use triple backticks with the language specified.
For diagrams use mermaid syntax in a code block.
For links to files use @/path/to/file.extension
Keep files between 50 and 100 lines.
</format>

<content>
The purpose of the context file is to make it as fast as possible to understand how to use the files in this module. 

The file should be easy to understand and useful, but not complete. Provide the minimum viable context for an engineer to use the module contents.

Provide a quick summary of the module's purpose and its value.
It shouldn't get into technical implementation details.

Explain the key interfaces, the entry points, and the exported functions with brief usage examples.
Code examples don't need to cover all possible arguments or edge cases, just the most common usage.
It must be instructive, not exhaustive.
Do not explain the internal details of the module.

You don't need to cover all the business rules, but you should call out any critical business logic, constraints,
gotchas, or anything that's not obvious from the code itself.

A diagram is not always necessary but if it helps explain a complex flow, include one using mermaid syntax.

Link to external documentation and specs or files rather than duplicating them here. If it covers complex engineering
concepts, link to tutorials for engineers to learn more.
</content>

<linting>
- After writing the CLAUDE.md file, run `pnpm format` on that single file to ensure proper formatting.
- Add a line break between <codeExample> tag and the code block.
</linting>
