---
name: developing-in-lightdash
description: Use when working with Lightdash content in the UI from current local state. Start with dashboard structure and layout; chart resources can be added later.
---

# Developing in Lightdash

Use this skill when working with the current dashboard state in the UI.

This skill is adapted from the Lightdash repo skill and uses JSON examples instead of YAML. It is for reading and editing Lightdash content in memory through frontend actions or local state updates.

Use the `frontendAction` tool for dashboard state work.

For reads, call `frontendAction` with:

- `action: "dashboard.read"`
- `payload: null`

This returns the current dashboard editor state as JSON.

For edits, call `frontendAction` with:

- `action: "dashboard.edit"`
- `payload.patch: [...]`

`payload.patch` must be an RFC6902 JSON Patch array. The frontend applies the patch to the current dashboard editor state and returns the updated dashboard state as JSON.

Recommended loop:

1. Call `frontendAction` with `action: "dashboard.read"` and inspect the current dashboard state.
2. Build the smallest possible JSON Patch to satisfy the request.
3. Call `frontendAction` with `action: "dashboard.edit"` and `payload.patch`.
4. Inspect the returned updated dashboard state before making more edits.

Start by loading the `dashboard-reference` resource for the full dashboard structure, tile types, layout rules, filters, config, examples, and best practices.
