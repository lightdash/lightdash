# Frontend

Table of contents:

- [Getting started](#getting-started)
- [Key technologies/libraries](#key-technologieslibraries)
- [Architecture](#architecture)
    - [UI](#ui)
    - [Features](#features)
    - [API](#api)
    - [Pages](#pages)

## Getting started

This package shouldn't be run in isolation. Instead, you should follow the instruction from
the [Setup development environment](../../.github/CONTRIBUTING.md#setup-development-environment)
section from the contribution file.

## Key technologies/libraries

- [React](https://reactjs.org/)
- [Vite](https://vitejs.dev/)
- [Mantine](https://mantine.dev/)
- [React Query](https://react-query.tanstack.com/)
- [Echarts](https://echarts.apache.org/en/index.html)

## Architecture

> **Note:** Any folder that doesn't match this structure should be considered legacy and should be refactored.

**Example structure:**

- UI
    - Molecules
    - Organisms
- Features
    - User
        - Hooks
        - Components
        - Modals
        - Utils
        - Providers
    - Organization
    - Project
    - Chart
    - Dashboard
    - Space
    - Visualization
- API
- Pages

This structure offers two entry points (through `features` or `pages`) which makes it easier for new developers to learn
the codebase. Plus, it eliminates abstract global folders, reducing potential dumping grounds.

> Inspiration: [Feature-driven folder structure](https://profy.dev/article/react-folder-structure)

### UI

Inspired by
the [Atomic Design Structure](https://bootcamp.uxdesign.cc/from-atoms-to-pages-implementing-atomic-design-in-react-2c91d1031e7c).

#### ~~Atoms~~

We shouldn’t need this folder as [Mantine](https://mantine.dev/) should provide all the components at this level.

#### Molecules

They are made up of one or more atomic components. They should only include the minimal amount of logic and state
necessary to perform their intended function. Examples of molecular components include form fields, cards, and other
similar UI elements that are composed of multiple atomic components.

Guidelines:

- the component is going to be reused in multiple places
- can not manage internal state

Lint restrictions:

- can’t import files from the rest of our codebase

#### Organisms

Organisms are made up of one or more molecular or atomic components. They tend to be larger in scope and provide a sense
of structure to the UI. Examples include headers, footers, and sidebars.

Guidelines:

- can manage basic internal state. eg: `const isOpen = useState<boolean>()`

Lint restrictions:

- can only import files from Molecules

### Features

There should be a folder for each of the main features ( aka knowledge domains) of our application. A good indicator is
how we structure our API routes. eg: org, user, project, chart, dashboard
There are also big UI features that deserve their own folder. eg: visualizations
Each of those features should have a subfolder for `hooks`, `components` , `modals` , `utils` , `provider`

### API

Should only have the endpoints and types necessary for interacting with our API.

Guidelines:

- files should be a 1 to 1 match to the backend router/controller files
- pure functions
- don’t have hooks, these should be defined inside the feature `hooks` folder

Lint restrictions:

- can’t import files from the rest of our FE codebase

### Pages

This should be a 1 to 1 match with our website routes.
