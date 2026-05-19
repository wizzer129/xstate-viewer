<template>
	<div class="state-tree-page d-flex flex-column">
		<StateTreeToolbar
			:has-graph="hasGraph"
			@zoom-out="onZoomOut"
			@zoom-in="onZoomIn"
			@reset-zoom="onResetZoom"
			@export-svg="onExportSvg"
			@export-png="onExportPng"
		/>

		<v-container fluid class="pa-0 flex-grow-1 state-tree-content">
			<v-row no-gutters class="state-tree-row">
				<StateTreeInputPanel
					:raw-input="rawInput"
					:parse-error="parseError"
					:layout-running="layoutRunning"
					:has-graph="hasGraph"
					:stats="stats"
					@update:raw-input="rawInput = $event"
					@parse="parse"
				/>

				<StateTreeDiagramCanvas
					ref="canvasRef"
					:has-graph="hasGraph"
					:nodes="nodes"
					:visible-nodes="visibleNodes"
					:visible-edges="visibleEdges"
				/>
			</v-row>
		</v-container>
	</div>
</template>

<script setup>
import { ref } from 'vue';
import StateTreeToolbar from '@/components/state-tree/StateTreeToolbar.vue';
import StateTreeInputPanel from '@/components/state-tree/StateTreeInputPanel.vue';
import StateTreeDiagramCanvas from '@/components/state-tree/StateTreeDiagramCanvas.vue';
import { useStateTreeViewer } from '@/composables/useStateTreeViewer';

const canvasRef = ref(null);

const {
	rawInput,
	parseError,
	layoutRunning,
	nodes,
	hasGraph,
	stats,
	visibleNodes,
	visibleEdges,
	parse,
} = useStateTreeViewer();

function onZoomOut() {
	canvasRef.value?.zoom(-0.2);
}

function onZoomIn() {
	canvasRef.value?.zoom(0.2);
}

function onResetZoom() {
	canvasRef.value?.resetZoom();
}

function onExportSvg() {
	canvasRef.value?.exportSvg();
}

function onExportPng() {
	canvasRef.value?.exportPng();
}
</script>

<style scoped>
.state-tree-page {
	height: calc(
		100dvh - var(--v-layout-top, 0px) - var(--v-layout-bottom, 0px)
	);
	min-height: 0;
	overflow: hidden;
}

.state-tree-content {
	height: 100%;
	min-height: 0;
	min-width: 0;
}

.state-tree-row {
	height: 100%;
	min-height: 0;
	min-width: 0;
	overflow: hidden;
}
</style>
