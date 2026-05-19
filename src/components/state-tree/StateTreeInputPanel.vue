<template>
	<v-col
		class="d-flex flex-column state-tree-input-col"
		:style="{ width: panelWidth + 'px', flex: 'none' }"
	>
		<div
			class="pa-3 flex-grow-1 d-flex flex-column gap-3 state-tree-input-wrap"
		>
			<div class="d-flex align-center justify-space-between mt-4 mb-6">
				<span
					class="text-caption text-medium-emphasis font-weight-medium text-uppercase"
				>
					State Tree Input
				</span>
				<a
					href="https://transform.tools/js-object-to-json"
					target="_blank"
					rel="noopener noreferrer"
					class="text-primary convert-link"
				>
					JS
					<v-icon size="18" class="mx-1" icon="mdi-arrow-right" />
					JSON
				</a>
			</div>

			<div class="code-editor-wrap mb-4">
				<div ref="editorEl" class="code-editor" />
			</div>

			<v-alert
				v-if="parseError"
				type="error"
				variant="tonal"
				density="compact"
				class="text-body-2"
			>
				{{ parseError }}
			</v-alert>

			<v-btn
				color="primary"
				size="x-large"
				prepend-icon="mdi-graph-outline"
				class="mt-4"
				:loading="layoutRunning"
				@click="$emit('parse')"
			>
				Render diagram
			</v-btn>

			<div v-if="hasGraph" class="text-caption text-medium-emphasis mt-4">
				{{ stats.states }} states · {{ stats.transitions }} transitions
				· {{ stats.compound }} compound
			</div>
		</div>

		<div class="resize-handle" @pointerdown="startDrag" />
	</v-col>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue';
import { EditorView, keymap, placeholder } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { json } from '@codemirror/lang-json';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';
import { bracketMatching } from '@codemirror/language';
import { autocompletion } from '@codemirror/autocomplete';

const MIN_WIDTH = 400;
const MAX_WIDTH = 2080;
const panelWidth = ref(MIN_WIDTH);

const props = defineProps({
	rawInput: {
		type: String,
		required: true,
	},
	parseError: {
		type: String,
		required: true,
	},
	layoutRunning: {
		type: Boolean,
		required: true,
	},
	hasGraph: {
		type: Boolean,
		required: true,
	},
	stats: {
		type: Object,
		required: true,
	},
});

const emit = defineEmits(['update:rawInput', 'parse']);

const editorEl = ref(null);
let editorView = null;
const languageCompartment = new Compartment();
let currentLanguage = null;

function detectLanguageMode(text) {
	const trimmed = text.trim();
	if (!trimmed) return 'javascript';

	try {
		JSON.parse(trimmed);
		return 'json';
	} catch {
		return 'javascript';
	}
}

function languageExtension(mode) {
	return mode === 'json' ? json() : javascript();
}

function syncLanguageMode(docText) {
	if (!editorView) return;
	const next = detectLanguageMode(docText);
	if (next === currentLanguage) return;
	currentLanguage = next;
	editorView.dispatch({
		effects: languageCompartment.reconfigure(languageExtension(next)),
	});
}

onMounted(() => {
	const updateListener = EditorView.updateListener.of((update) => {
		if (update.docChanged) {
			const nextText = update.state.doc.toString();
			emit('update:rawInput', nextText);
			syncLanguageMode(nextText);
		}
	});

	currentLanguage = detectLanguageMode(props.rawInput);

	const state = EditorState.create({
		doc: props.rawInput,
		extensions: [
			history(),
			keymap.of([...defaultKeymap, ...historyKeymap]),
			languageCompartment.of(languageExtension(currentLanguage)),
			oneDark,
			bracketMatching(),
			autocompletion(),
			placeholder('Paste { initial, states: { ... } } here'),
			EditorView.lineWrapping,
			updateListener,
		],
	});

	editorView = new EditorView({
		state,
		parent: editorEl.value,
	});
});

watch(
	() => props.rawInput,
	(val) => {
		if (!editorView) return;
		const current = editorView.state.doc.toString();
		if (val !== current) {
			editorView.dispatch({
				changes: { from: 0, to: current.length, insert: val },
			});
			syncLanguageMode(val);
		}
	}
);

function startDrag(e) {
	e.preventDefault();
	const startX = e.clientX;
	const startWidth = panelWidth.value;

	function onMove(ev) {
		const dx = ev.clientX - startX;
		panelWidth.value = Math.min(
			MAX_WIDTH,
			Math.max(MIN_WIDTH, startWidth + dx)
		);
	}

	function onUp() {
		window.removeEventListener('pointermove', onMove);
		window.removeEventListener('pointerup', onUp);
	}

	window.addEventListener('pointermove', onMove);
	window.addEventListener('pointerup', onUp);
}
</script>

<style scoped>
.state-tree-input-col {
	position: relative;
	height: 100%;
	min-height: 0;
	border-right: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.state-tree-input-wrap {
	min-height: 0;
	overflow: hidden;
}

.code-editor-wrap {
	flex: 1 1 0;
	min-height: 0;
	border-radius: 4px;
	border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
	display: flex;
	flex-direction: column;
	overflow: hidden;
}

.code-editor {
	flex: 1 1 0;
	min-height: 0;
	overflow: hidden;
}

.code-editor :deep(.cm-editor) {
	height: 100%;
	font-size: 11px;
}

.code-editor :deep(.cm-scroller) {
	overflow: auto;
	font-family: monospace;
}

.code-editor :deep(.cm-content) {
	min-height: 0;
}

.convert-link {
	text-decoration: none;
	font-size: 1.2rem;
}

.convert-link:hover {
	text-decoration: underline;
}

.resize-handle {
	position: absolute;
	top: 0;
	right: -4px;
	width: 8px;
	height: 100%;
	cursor: col-resize;
	z-index: 10;
}

.resize-handle:hover,
.resize-handle:active {
	background: rgba(var(--v-theme-primary), 0.25);
}
</style>
