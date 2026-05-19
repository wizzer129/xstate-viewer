<template>
	<v-col
		class="position-relative fill-height state-tree-canvas-col"
		style="background: rgb(var(--v-theme-surface))"
	>
		<div
			v-if="!hasGraph"
			class="fill-height d-flex flex-column align-center justify-center text-medium-emphasis gap-2"
		>
			<v-icon size="48" icon="mdi-graph-outline" opacity="0.3" />
			<span class="text-body-2">Paste a state tree and click Render</span>
		</div>

		<svg
			v-show="hasGraph"
			ref="svgEl"
			class="fill-height state-tree-svg"
			width="100%"
			height="100%"
			style="display: block; cursor: grab"
			:style="{ cursor: isPanning ? 'grabbing' : 'grab' }"
		>
			<g ref="zoomGroupEl">
				<g class="nodes">
					<g
						v-for="node in visibleNodes"
						:key="node.id"
						style="cursor: pointer"
					>
						<rect
							:x="node.x"
							:y="node.y"
							:width="node.width"
							:height="node.height"
							:rx="node.isCompound ? 12 : 8"
							:fill="node.fill"
							:stroke="node.stroke"
							stroke-width="0.75"
						/>

						<text
							:x="
								node.x + (node.isCompound ? 14 : node.width / 2)
							"
							:y="
								node.y +
								(node.isCompound ? 18 : node.height / 2)
							"
							:text-anchor="node.isCompound ? 'start' : 'middle'"
							dominant-baseline="central"
							:fill="node.textColor"
							font-size="13"
							font-weight="500"
							font-family="system-ui, sans-serif"
						>
							{{ node.label }}
						</text>

						<text
							v-if="node.subtitle && !node.isCompound"
							:x="node.x + node.width / 2"
							:y="node.y + node.height / 2 + 14"
							text-anchor="middle"
							dominant-baseline="central"
							:fill="node.stroke"
							font-size="10"
							font-family="monospace"
							opacity="0.85"
						>
							{{ node.subtitle }}
						</text>

						<circle
							v-if="node.isInitial"
							:cx="node.x + node.width / 2"
							:cy="node.y - 10"
							r="5"
							:fill="node.stroke"
						/>
						<line
							v-if="node.isInitial"
							:x1="node.x + node.width / 2"
							:y1="node.y - 5"
							:x2="node.x + node.width / 2"
							:y2="node.y"
							:stroke="node.stroke"
							stroke-width="1.5"
							marker-end="url(#arrow)"
						/>
					</g>
				</g>

				<g class="edge-paths">
					<g
						v-for="edge in adjustedVisibleEdges"
						:key="`path-${edge.id}`"
					>
						<path
							:d="edge.path"
							fill="none"
							:stroke="edge.renderColor"
							stroke-width="1.2"
							opacity="0.75"
							marker-end="url(#arrow)"
						/>
					</g>
				</g>

				<g class="edge-labels">
					<g
						v-for="edge in adjustedVisibleEdges"
						:key="`label-${edge.id}`"
					>
						<rect
							v-if="edge.label"
							:x="edge.renderLabelX - edge.labelW / 2 - 3"
							:y="edge.renderLabelY - 8"
							:width="edge.labelW + 6"
							height="14"
							rx="3"
							:fill="canvasBg"
						/>
						<text
							v-if="edge.label"
							:x="edge.renderLabelX"
							:y="edge.renderLabelY"
							text-anchor="middle"
							dominant-baseline="central"
							:fill="edge.renderColor"
							font-size="10"
							font-family="monospace"
						>
							{{ edge.label }}
						</text>
					</g>
				</g>

				<defs>
					<marker
						id="arrow"
						viewBox="0 0 10 10"
						refX="8"
						refY="5"
						markerWidth="6"
						markerHeight="6"
						orient="auto-start-reverse"
					>
						<path
							d="M2 1L8 5L2 9"
							fill="none"
							stroke="context-stroke"
							stroke-width="1.5"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</marker>
				</defs>
			</g>
		</svg>
	</v-col>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { select } from 'd3-selection';
import { zoom as d3zoom, zoomIdentity } from 'd3-zoom';

const props = defineProps({
	hasGraph: {
		type: Boolean,
		required: true,
	},
	nodes: {
		type: Array,
		required: true,
	},
	visibleNodes: {
		type: Array,
		required: true,
	},
	visibleEdges: {
		type: Array,
		required: true,
	},
});

defineEmits([]);

const svgEl = ref(null);
const zoomGroupEl = ref(null);
const isPanning = ref(false);
const canvasBg = computed(() => '#ffffff');

const LABEL_HEIGHT = 14;
const LABEL_X_GAP = 8;
const LABEL_Y_GAP = 4;
const LABEL_OFFSETS = [
	{ x: 0, y: 0 },
	{ x: 0, y: 10 },
	{ x: 0, y: -10 },
	{ x: 12, y: 0 },
	{ x: -12, y: 0 },
	{ x: 12, y: 10 },
	{ x: -12, y: 10 },
	{ x: 12, y: -10 },
	{ x: -12, y: -10 },
	{ x: 0, y: 18 },
	{ x: 0, y: -18 },
];

function edgeColorFromId(id) {
	const key = String(id || 'edge');
	let hash = 2166136261;
	for (let i = 0; i < key.length; i += 1) {
		hash ^= key.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}

	const hue = Math.abs(hash) % 360;
	const sat = 62 + (Math.abs(hash >> 3) % 18);
	const light = 38 + (Math.abs(hash >> 7) % 14);
	return `hsl(${hue} ${sat}% ${light}%)`;
}

const adjustedVisibleEdges = computed(() => {
	const placed = [];

	function hasCollision(x, y, width) {
		return placed.some((p) => {
			const overlapX =
				Math.abs(x - p.x) < (width + p.w) / 2 + LABEL_X_GAP;
			const overlapY = Math.abs(y - p.y) < LABEL_HEIGHT + LABEL_Y_GAP;
			return overlapX && overlapY;
		});
	}

	return props.visibleEdges.map((edge) => {
		if (!edge?.label) {
			return {
				...edge,
				renderColor: edgeColorFromId(edge?.id),
				renderLabelX: edge?.labelX ?? 0,
				renderLabelY: edge?.labelY ?? 0,
			};
		}

		const baseX = Number.isFinite(edge.labelX) ? edge.labelX : 0;
		const baseY = Number.isFinite(edge.labelY) ? edge.labelY : 0;
		const width = Number.isFinite(edge.labelW)
			? Math.max(8, edge.labelW)
			: 8;

		let x = baseX;
		let y = baseY;

		for (const offset of LABEL_OFFSETS) {
			const candidateX = baseX + offset.x;
			const candidateY = baseY + offset.y;
			if (!hasCollision(candidateX, candidateY, width)) {
				x = candidateX;
				y = candidateY;
				break;
			}
		}

		placed.push({ x, y, w: width });

		return {
			...edge,
			renderColor: edgeColorFromId(edge.id),
			renderLabelX: x,
			renderLabelY: y,
		};
	});
});

let zoomBehavior = null;
let resizeObserver = null;

function getFitNodes() {
	const source = props.visibleNodes.length ? props.visibleNodes : props.nodes;
	return source.filter((n) => {
		if (!n) return false;
		const x = Number(n.x);
		const y = Number(n.y);
		const w = Number(n.width);
		const h = Number(n.height);
		if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
		if (!Number.isFinite(w) || !Number.isFinite(h)) return false;
		if (w <= 0 || h <= 0) return false;
		if (Math.abs(x) > 1_000_000 || Math.abs(y) > 1_000_000) return false;
		if (w > 100_000 || h > 100_000) return false;
		return true;
	});
}

function scheduleFit() {
	if (!props.hasGraph) return;
	requestAnimationFrame(() => {
		requestAnimationFrame(() => {
			fitToScreen();
		});
	});
}

function initZoom() {
	if (!svgEl.value) return;

	zoomBehavior = d3zoom()
		.scaleExtent([0.1, 4])
		.on('start', () => {
			isPanning.value = true;
		})
		.on('zoom', (event) => {
			select(zoomGroupEl.value).attr('transform', event.transform);
		})
		.on('end', () => {
			isPanning.value = false;
		});

	select(svgEl.value).call(zoomBehavior);
}

function zoom(delta) {
	if (!zoomBehavior || !svgEl.value) return;
	const svg = select(svgEl.value);
	zoomBehavior.scaleBy(svg.transition().duration(250), 1 + delta);
}

function fitToScreen() {
	const fitNodes = getFitNodes();
	if (!zoomBehavior || !svgEl.value || !fitNodes.length) return;

	const rect = svgEl.value.getBoundingClientRect();
	const svgW = rect.width || svgEl.value.clientWidth || 800;
	const svgH = rect.height || svgEl.value.clientHeight || 600;
	if (!svgW || !svgH) return;

	const xs = fitNodes.map((n) => n.x);
	const ys = fitNodes.map((n) => n.y);
	const xe = fitNodes.map((n) => n.x + n.width);
	const ye = fitNodes.map((n) => n.y + n.height);

	const minX = Math.min(...xs);
	const minY = Math.min(...ys);
	const maxX = Math.max(...xe);
	const maxY = Math.max(...ye);

	const graphW = maxX - minX;
	const graphH = maxY - minY;
	if (!Number.isFinite(graphW) || !Number.isFinite(graphH)) return;
	if (graphW <= 0 || graphH <= 0) return;

	const pad = 20;
	const rawScale = Math.min(
		(svgW - pad * 2) / graphW,
		(svgH - pad * 2) / graphH,
		2
	);
	const scale = Number.isFinite(rawScale) ? Math.max(0.05, rawScale) : 1;
	const tx = (svgW - graphW * scale) / 2 - minX * scale;
	const ty = (svgH - graphH * scale) / 2 - minY * scale;
	if (!Number.isFinite(tx) || !Number.isFinite(ty)) return;
	const t = zoomIdentity.translate(tx, ty).scale(scale);

	select(svgEl.value)
		.interrupt()
		.transition()
		.duration(400)
		.call(zoomBehavior.transform, t);
}

function resetZoom() {
	fitToScreen();
}

function getSvgString() {
	const svgNode = svgEl.value;
	if (!svgNode) return '';

	const clone = svgNode.cloneNode(true);

	const xs = props.nodes.map((n) => n.x);
	const ys = props.nodes.map((n) => n.y);
	const xe = props.nodes.map((n) => n.x + n.width);
	const ye = props.nodes.map((n) => n.y + n.height);

	const minX = Math.min(...xs) - 40;
	const minY = Math.min(...ys) - 40;
	const maxX = Math.max(...xe) + 40;
	const maxY = Math.max(...ye) + 40;
	const w = maxX - minX;
	const h = maxY - minY;

	clone.setAttribute('viewBox', `${minX} ${minY} ${w} ${h}`);
	clone.setAttribute('width', String(w));
	clone.setAttribute('height', String(h));

	const zg = clone.querySelector('g');
	if (zg) zg.removeAttribute('transform');

	const style = document.createElementNS(
		'http://www.w3.org/2000/svg',
		'style'
	);
	style.textContent = `text { font-family: system-ui, -apple-system, sans-serif; }`;
	clone.prepend(style);

	return new XMLSerializer().serializeToString(clone);
}

function exportSvg() {
	const str = getSvgString();
	const blob = new Blob([str], { type: 'image/svg+xml;charset=utf-8' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = 'state-tree.svg';
	a.click();
	URL.revokeObjectURL(url);
}

function exportPng() {
	const str = getSvgString();
	const blob = new Blob([str], { type: 'image/svg+xml;charset=utf-8' });
	const url = URL.createObjectURL(blob);
	const img = new Image();
	img.onload = () => {
		const scale = 2;
		const canvas = document.createElement('canvas');
		canvas.width = img.naturalWidth * scale;
		canvas.height = img.naturalHeight * scale;
		const ctx = canvas.getContext('2d');
		ctx.scale(scale, scale);
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		ctx.drawImage(img, 0, 0);
		URL.revokeObjectURL(url);
		canvas.toBlob((b) => {
			if (!b) return;
			const a = document.createElement('a');
			a.href = URL.createObjectURL(b);
			a.download = 'state-tree.png';
			a.click();
		}, 'image/png');
	};
	img.src = url;
}

onMounted(() => {
	initZoom();
	if (typeof ResizeObserver !== 'undefined' && svgEl.value) {
		resizeObserver = new ResizeObserver(() => {
			scheduleFit();
		});
		resizeObserver.observe(svgEl.value);
	}
	window.addEventListener('resize', scheduleFit);
});

watch(
	() => props.nodes,
	() => {
		if (props.hasGraph) nextTick(scheduleFit);
	}
);

watch(
	() => props.hasGraph,
	(v) => {
		if (v) nextTick(scheduleFit);
	}
);

watch(
	() => props.visibleNodes.length,
	() => {
		scheduleFit();
	}
);

onUnmounted(() => {
	if (resizeObserver) {
		resizeObserver.disconnect();
		resizeObserver = null;
	}
	window.removeEventListener('resize', scheduleFit);
});

defineExpose({
	zoom,
	resetZoom,
	exportSvg,
	exportPng,
	fitToScreen,
});
</script>

<style scoped>
.state-tree-canvas-col {
	height: 100%;
	min-height: 0;
	min-width: 0;
}

.state-tree-svg {
	height: 100%;
	width: 100%;
	min-height: 0;
	user-select: none;
	-webkit-user-select: none;
	-moz-user-select: none;
	-ms-user-select: none;
	-webkit-touch-callout: none;
}

.state-tree-svg text,
.state-tree-svg tspan,
.state-tree-svg path,
.state-tree-svg rect,
.state-tree-svg circle,
.state-tree-svg line,
.state-tree-svg g {
	user-select: none;
	-webkit-user-select: none;
	-moz-user-select: none;
	-ms-user-select: none;
	pointer-events: auto;
}
</style>
