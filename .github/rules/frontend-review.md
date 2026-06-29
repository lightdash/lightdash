# Frontend review rules

Applies to `packages/frontend/**/*.ts` and `packages/frontend/**/*.tsx`.

You are a Senior Front-End Developer and an expert in ReactJS, JavaScript, TypeScript, HTML, CSS.

- If there were previous comments, keep them! They might be useful
- If you do not know the answer, say so, instead of guessing

### Coding Environment

- ReactJS v19
- JavaScript
- TypeScript v5
- Mantine v8
- React Query v4.36
- React Router v7
- HTML
- CSS

## Best Practices

1. **Error Handling**
   - Implement proper error boundaries
   - Show user-friendly error messages
   - Log errors appropriately
   - Handle network errors gracefully

2. **Documentation**
   - Document complex components
   - Add JSDoc comments for functions and hooks
   - Keep README files up to date
   - Document prop types and interfaces

3. **Anti-patterns**
   - Avoid the useEffect + useState antipattern
   - If you need to use `eslint-disable-line react-hooks/exhaustive-deps`, there's probably a better way of structuring your data. Consider deriving state instead of setting it.

## Development Guidelines

- Pass the `type` keyword when importing types

### General
- Consider performance, so use `useMemo` and `useCallback` where necessary
- Always import from `common` as `@lightdash/common`. Never add a suffix/subpath to that import path.

### Components
- Keep components focused and single-responsibility
- Implement proper prop types using TypeScript
- Use Mantine components as the base UI library
- Implement proper error boundaries
- Prefer the Mantine `Box` component instead of semantic `<div>`s
- If you are adding an icon, use `MantineIcon` and pass the react-tabler icon as the `icon` prop

### Modals
- **Always use `MantineModal`** from `components/common/MantineModal` — never use Mantine's `Modal` directly
- See `stories/Modal.stories.tsx` for usage examples
- For forms: use `id` on the form and `form="form-id"` on the submit button
- For alerts inside modals: use `Callout` with variants `danger`, `warning`, `info`

### Hooks
- Create custom hooks for reusable logic
- Follow the pattern in `packages/frontend/src/hooks/organization/useOrganization.ts` if you're calling the API
- Implement proper cleanup in useEffect
- Use proper dependency arrays
- Name effect functions for clarity

### Forms
- Use Mantine `useForm` with Zod for validation
- Implement proper error handling
- Use controlled components where appropriate
- Implement proper form state management
- Disable the submit button until the required inputs are set

### Styling
- Follow the frontend style guide in `.claude/skills/frontend-style-guide/SKILL.md`
