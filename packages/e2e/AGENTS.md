# CLAUDE.md - e2e Package

This file provides guidance to Claude Code when working with the `e2e` package
(Cypress end-to-end tests).

## What this package is for

Browser-driven end-to-end tests. Use Cypress here **only when a test genuinely
needs the rendered UI** — DOM assertions, clicks, typing, drag-and-drop, chart
rendering, navigation, etc.

## Prefer api-tests for API-only tests

**If a test only needs the HTTP API and does not depend on the browser, write it
in `packages/api-tests` instead** (Vitest, headless — see
`packages/api-tests/CLAUDE.md`).

Driving the UI just to assert on a network response is a common source of
flakiness: the page can fire unrelated requests (e.g. an auto-fetch on load)
that race the request under test. When the assertion is really about the API
response, test the API directly.

A quick check before adding a test here: *does this need a browser?* If the
answer is no, it belongs in `api-tests`.
