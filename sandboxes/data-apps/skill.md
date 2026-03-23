# Data App Scaffold — Claude Code Skill

You are building a Lightdash data app. This is a standalone React + Vite project with Tailwind CSS and shadcn/ui components.

## Rules

1. **Only write files in `src/`** — never modify config files, `package.json`, or anything outside `src/`.
2. **Never run `npm install`, `pnpm add`, or any package install command** — all dependencies are pre-installed and locked.
3. **Only import from approved packages** — see list below. Any other import will fail at build time.

## Approved Packages

- `react`, `react-dom`
- `@lightdash/query-sdk` — Lightdash semantic layer SDK (pending GLITCH-274)
- `recharts` — charting library
- `@tanstack/react-query` — data fetching
- `@tanstack/react-table` — headless data tables
- `@tanstack/react-virtual` — virtualised rendering for large lists/tables
- `date-fns` — date manipulation (tree-shakeable)
- `lodash-es` — utility functions (tree-shakeable, use named imports)
- `lucide-react` — icons (tree-shakeable)
- `clsx`, `tailwind-merge`, `class-variance-authority` — styling utilities

## Pre-baked shadcn/ui Components

These are already available in `src/components/ui/`:

- `Button`, `Badge`, `Card` (`CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`)
- `Table` (`TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`)
- `Dialog`, `Tabs`, `Select`, `Input`, `Label`, `Popover`, `Tooltip`, `Separator`

Import them from `@/components/ui/<name>`.

## Utility

`cn()` is available from `@/lib/utils` for merging Tailwind classes.

## Semantic Layer Context (Jaffle Shop)

The connected Lightdash project uses the **jaffle_shop** dbt project with the following semantic layer:

### Models
- `customers` — One row per customer
- `orders` — One row per order
- `payments` — One row per payment

### Dimensions
- `customers`: `customer_id`, `first_name`, `last_name`, `first_order_date`, `most_recent_order_date`, `number_of_orders`
- `orders`: `order_id`, `customer_id`, `order_date`, `status` (returned, completed, return_pending, shipped, placed)
- `payments`: `payment_id`, `order_id`, `payment_method` (credit_card, coupon, bank_transfer, gift_card), `amount`

### Metrics
- `customers`: `total_customers` (count)
- `orders`: `total_orders` (count), `completed_orders` (count, filtered status=completed), `returned_orders` (count, filtered status=returned), `order_completion_rate` (derived: completed_orders / total_orders)
- `payments`: `total_revenue` (sum of amount), `average_order_value` (average of amount)

## Environment Variables

- `LIGHTDASH_PAT` — Personal access token (available at runtime, not in browser)
- `LIGHTDASH_PROJECT_UUID` — Target project UUID
- `LIGHTDASH_URL` — Lightdash API base URL
