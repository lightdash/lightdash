# Lightdash SDK

The Lightdash SDK provides React components for embedding Lightdash dashboards and explores in your applications.

## Components

### Dashboard

The `Dashboard` component allows you to embed a Lightdash dashboard in your application.

```tsx
import { Dashboard } from '@lightdash/sdk';

function App() {
  return (
    <Dashboard
      instanceUrl="https://your-lightdash-instance.com"
      token="your-embed-token"
      onExplore={(options) => {
        // Handle explore navigation
        console.log('Navigate to explore:', options.exploreId);
      }}
    />
  );
}
```

### Explore

The `Explore` component allows you to embed a Lightdash explore in your application. This provides a **minimal, focused interface** showing only the visualization without the full Lightdash UI.

```tsx
import { Explore } from '@lightdash/sdk';

function App() {
  return (
    <Explore
      instanceUrl="https://your-lightdash-instance.com"
      token="your-embed-token"
      exploreId="your-explore-id"
      onExplore={(options) => {
        // Handle explore navigation
        console.log('Navigate to explore:', options.exploreId);
      }}
    />
  );
}
```

## Props

### Common Props

Both `Dashboard` and `Explore` components accept the following props:

- `instanceUrl` (string): The URL of your Lightdash instance
- `token` (string | Promise<string>): The embed token for authentication
- `styles` (object, optional): Custom styling options
  - `backgroundColor` (string, optional): Background color
  - `fontFamily` (string, optional): Font family
- `filters` (array, optional): Array of filters to apply
- `contentOverrides` (object, optional): Language overrides
- `onExplore` (function, optional): Callback function when "Explore from here" is clicked

### Explore-specific Props

The `Explore` component additionally accepts:

- `exploreId` (string): The ID of the explore to display

## Usage Examples

### Basic Dashboard Embed

```tsx
<Dashboard
  instanceUrl="https://app.lightdash.com"
  token="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
/>
```

### Dashboard with Custom Styling

```tsx
<Dashboard
  instanceUrl="https://app.lightdash.com"
  token="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  styles={{
    backgroundColor: '#f5f5f5',
    fontFamily: 'Arial, sans-serif'
  }}
/>
```

### Dashboard with Explore Navigation

```tsx
<Dashboard
  instanceUrl="https://app.lightdash.com"
  token="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  onExplore={(options) => {
    // Navigate to the explore page
    window.location.href = `/explore/${options.exploreId}`;
  }}
/>
```

### Basic Explore Embed

```tsx
<Explore
  instanceUrl="https://app.lightdash.com"
  token="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  exploreId="customers"
/>
```

### Explore with Custom Styling

```tsx
<Explore
  instanceUrl="https://app.lightdash.com"
  token="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  exploreId="customers"
  styles={{
    backgroundColor: '#ffffff',
    fontFamily: 'Inter, sans-serif'
  }}
/>
```

## Component Differences

### Dashboard vs Explore

| Feature           | Dashboard                             | Explore                          |
|-------------------|---------------------------------------|----------------------------------|
| **Content**       | Full dashboard with multiple tiles    | Single explore visualization     |
| **UI Elements**   | Dashboard header, tiles, filters      | Just the chart visualization     |
| **Interactivity** | Full dashboard interactions           | Read-only chart view             |
| **Use Case**      | Embedding complete dashboards         | Embedding single charts/explores |
| **Navigation**    | "Explore from here" buttons on charts | N/A (already in explore view)    |

### Explore Component Features

The Explore component provides a **minimal, focused experience**:

- ✅ **Clean visualization** - Only shows the chart, no extra UI
- ✅ **White background** - Clean, embeddable appearance
- ✅ **Responsive design** - Adapts to container size
- ✅ **No Lightdash branding** - Perfect for external embeds
- ✅ **Fast loading** - Lightweight, focused interface

## Authentication

The SDK uses JWT tokens for authentication. You can provide the token as a string or as a Promise that resolves to a string.

```tsx
// String token
<Dashboard token="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." />

// Promise token
<Dashboard token={fetchTokenFromAPI()} />
```

## Error Handling

The SDK components handle various error states:

- Invalid or expired tokens
- Missing project UUID
- Network errors
- Missing explore ID (for Explore component)

Error states are displayed with user-friendly messages and appropriate icons.

## Styling

You can customize the appearance of embedded components using the `styles` prop:

```tsx
<Dashboard
  styles={{
    backgroundColor: '#ffffff',
    fontFamily: 'Inter, sans-serif'
  }}
/>
```

## Filters

You can apply filters to the embedded content:

```tsx
<Dashboard
  filters={[
    {
      model: 'customers',
      field: 'status',
      operator: 'equals',
      value: 'active'
    }
  ]}
/>
```

## Content Overrides

You can override text content for internationalization:

```tsx
<Dashboard
  contentOverrides={{
    'dashboard.title': 'Custom Dashboard Title',
    'chart.loading': 'Loading chart...'
  }}
/>
``` 