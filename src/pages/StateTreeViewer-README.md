# StateTreeViewer

A Vue 3 + Vuetify component that parses XState v4 config objects and renders
an interactive, zoomable state machine diagram with SVG + PNG export.

## Current project status (xstate-visualizer)

This project is already wired correctly:

- Component location: `src/pages/StateTreeViewer.vue`
- Route: `/` renders `StateTreeViewer` via `src/router/index.js`
- App shell: `src/App.vue` renders `<router-view />`
- Dependencies present in `package.json`: `elkjs`, `d3-selection`, `d3-zoom`, `@mdi/font`

No additional integration steps are required for this repository.

## Dependencies

```bash
bun add elkjs d3-zoom d3-selection
```

> `elkjs` handles the graph layout (layered algorithm, supports compound states).
> `d3-zoom` handles pan/zoom on the SVG canvas.
> No other runtime deps beyond Vue 3 + Vuetify.

## If you want this in another Vue 3 + Vuetify project

### 1. Copy the component

```
src/
  pages/
    StateTreeViewer.vue   ← copy here
```

### 2. Register a route (vue-router)

```js
// src/router/index.js
import StateTreeViewer from '@/pages/StateTreeViewer.vue';

const routes = [
	// ... your existing routes
	{
		path: '/state-viewer',
		name: 'StateTreeViewer',
		component: StateTreeViewer,
	},
];
```

### 3. Add a nav link (optional)

```html
<v-list-item
	to="/state-viewer"
	prepend-icon="mdi-graph-outline"
	title="State Viewer"
/>
```

### 4. Vuetify icons

The component uses MDI icons. Make sure your Vuetify setup includes them:

```bash
bun add @mdi/font
```

```js
// main.js / vuetify plugin
import '@mdi/font/css/materialdesignicons.css';
import { createVuetify } from 'vuetify';

export default createVuetify({
	icons: { defaultSet: 'mdi' },
});
```

## Usage

Paste any of these formats into the textarea and click **Render diagram**:

### Plain JS object

```js
{
  initial: 'Idle',
  states: {
    Idle: { on: { START: 'Running' } },
    Running: {
      entry: ['doWork'],
      on: { STOP: 'Idle', ERROR: 'Failed' }
    },
    Failed: { on: { RESET: 'Idle' } },
  }
}
```

### Variable assignment (stripped automatically)

```js
const machine = {
  initial: 'Idle',
  states: { ... }
}
```

### module.exports

```js
module.exports = {
  initial: 'Idle',
  states: { ... }
}
```

### Object with `stateTree` key

```js
module.exports = {
  stateTree: {
    initial: 'Idle',
    states: { ... }
  }
}
```

### JSON

```json
{
	"initial": "Idle",
	"states": {
		"Idle": { "on": { "START": "Running" } },
		"Running": { "on": { "STOP": "Idle" } }
	}
}
```

## Features

| Feature         | Detail                                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Layout engine   | ELK layered (top-down), orthogonal edge routing                                                                           |
| Compound states | Click container to collapse/expand substates                                                                              |
| Node colors     | Auto-assigned by naming convention (error → red, retry/disconnect → amber, idle → gray, compound → purple, active → teal) |
| Edge labels     | Event names, truncated at 18 chars                                                                                        |
| Pan / zoom      | Mouse drag + scroll, toolbar buttons, fit-to-screen                                                                       |
| Export SVG      | Clean export with zoom reset, embedded font styles                                                                        |
| Export PNG      | 2× retina resolution, white background                                                                                    |

## ELK layout options

The layout is configured in the `ELK_OPTS` constant near the top of the
component. Key options you might want to tweak:

```js
const ELK_OPTS = {
	'elk.algorithm': 'layered', // or 'force', 'stress', 'mrtree'
	'elk.direction': 'DOWN', // DOWN | RIGHT | UP | LEFT
	'elk.spacing.nodeNode': '40', // gap between sibling nodes
	'elk.layered.spacing.nodeNodeBetweenLayers': '60', // gap between layers
	'elk.edgeRouting': 'ORTHOGONAL', // ORTHOGONAL | SPLINES | POLYLINE
};
```

## Known limitations

- Cross-hierarchy edges (transitions from a substate to a top-level state)
  are collected at the root ELK graph level. ELK handles the routing but
  the visual may look slightly indirect on very deep trees.
- `after` (delayed XState transitions) are ignored — only `on` transitions
  are rendered.
- `guard` conditions are not shown on edge labels.
