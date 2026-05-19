import { ref, computed } from 'vue';
import ELK from 'elkjs/lib/elk.bundled.js';

const PALETTE = {
	teal: { fill: '#E1F5EE', stroke: '#0F6E56', text: '#085041' },
	amber: { fill: '#FAEEDA', stroke: '#854F0B', text: '#633806' },
	red: { fill: '#FCEBEB', stroke: '#A32D2D', text: '#791F1F' },
	gray: { fill: '#F1EFE8', stroke: '#5F5E5A', text: '#444441' },
	purple: { fill: '#EEEDFE', stroke: '#534AB7', text: '#3C3489' },
};

const ELK_OPTS = {
	'elk.algorithm': 'layered',
	'elk.direction': 'DOWN',
	'elk.spacing.nodeNode': '40',
	'elk.layered.spacing.nodeNodeBetweenLayers': '60',
	'elk.edgeRouting': 'ORTHOGONAL',
	'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
	'elk.padding': '[top=36,left=20,bottom=20,right=20]',
};

const elk = new ELK();

function estimateTextWidth(text, pxSize) {
	if (!text) return 0;
	const avgGlyph = pxSize * 0.62;
	return Math.ceil(String(text).length * avgGlyph);
}

function nodeDimensions(name, def, isCompound) {
	if (isCompound) {
		const minWidth = 220;
		const labelWidth = estimateTextWidth(name, 13) + 40;
		return {
			width: Math.max(minWidth, labelWidth),
			height: 160,
		};
	}

	const entry = def?.entry
		? Array.isArray(def.entry)
			? def.entry
			: [def.entry]
		: [];
	const subtitle = entry.length ? entry.join(', ') : '';

	const minWidth = 160;
	const labelWidth = estimateTextWidth(name, 13) + 32;
	const subtitleWidth = subtitle ? estimateTextWidth(subtitle, 10) + 28 : 0;

	return {
		width: Math.max(minWidth, labelWidth, subtitleWidth),
		height: subtitle ? 58 : 44,
	};
}

function colorFor(name, def) {
	const lo = name.toLowerCase();
	if (lo.includes('error')) return PALETTE.red;
	if (
		lo.includes('disabled') ||
		lo.includes('disconnect') ||
		lo.includes('retry') ||
		lo.includes('cancel')
	)
		return PALETTE.amber;
	if (lo === 'idle') return PALETTE.gray;
	if (def?.states) return PALETTE.purple;
	return PALETTE.teal;
}

function parseInput(raw) {
	// Try JSON first
	try {
		return JSON.parse(raw);
	} catch {}

	// Try as JS object literal — wrap in a return statement and eval
	try {
		let src = raw.trim();
		src = src
			.replace(/^(?:const|let|var)\s+\w+\s*=\s*/, '')
			.replace(/^module\.exports\s*=\s*/, '')
			.replace(/;$/, '');
		// eslint-disable-next-line no-new-func
		const result = new Function(`"use strict"; return (${src})`)();
		if (result && result.states) return result;
		if (result && result.stateTree) return result.stateTree;
		throw new Error('No { initial, states } found');
	} catch (e) {
		throw new Error(`Could not parse input: ${e.message}`);
	}
}

function getStatesAtPath(rootStates, parentId) {
	if (!parentId) return rootStates;
	const parts = parentId.split('__');
	let curStates = rootStates;
	for (const part of parts) {
		const next = curStates?.[part];
		curStates = next?.states;
		if (!curStates) return null;
	}
	return curStates;
}

function resolveTargetId(target, parentId, tree, localStates, stateIdIndex) {
	const rootStates = tree?.states;
	if (!rootStates) return null;

	if (typeof target !== 'string') return null;
	let cleaned = target.trim();
	if (!cleaned) return null;

	if (cleaned.startsWith('#')) {
		cleaned = cleaned.slice(1);
	}

	if (cleaned.includes('.')) {
		const parts = cleaned.split('.').filter(Boolean);
		if (parts.length > 1) {
			const alias = stateIdIndex?.get(parts[0]);
			if (alias !== undefined) {
				parts.shift();
				const baseParts = alias ? alias.split('__') : [];
				return [...baseParts, ...parts].join('__');
			}

			if (tree?.id && parts[0] === tree.id) {
				parts.shift();
			}
		}
		return parts.join('__');
	}

	if (cleaned.includes('__')) {
		return cleaned;
	}

	if (
		localStates &&
		Object.prototype.hasOwnProperty.call(localStates, cleaned)
	) {
		return parentId ? `${parentId}__${cleaned}` : cleaned;
	}

	const ancestors = [];
	if (parentId) {
		const parts = parentId.split('__');
		for (let i = parts.length; i >= 0; i -= 1) {
			ancestors.push(parts.slice(0, i).join('__'));
		}
	} else {
		ancestors.push('');
	}

	for (const scopeId of ancestors) {
		const scopeStates = getStatesAtPath(rootStates, scopeId);
		if (
			scopeStates &&
			Object.prototype.hasOwnProperty.call(scopeStates, cleaned)
		) {
			return scopeId ? `${scopeId}__${cleaned}` : cleaned;
		}
	}

	if (Object.prototype.hasOwnProperty.call(rootStates, cleaned)) {
		return cleaned;
	}

	return null;
}

function extractTargets(rawTarget) {
	if (typeof rawTarget === 'string') return [rawTarget];
	if (Array.isArray(rawTarget)) {
		return rawTarget.flatMap((item) => extractTargets(item));
	}
	if (rawTarget && typeof rawTarget === 'object') {
		if (typeof rawTarget.target === 'string') return [rawTarget.target];
		if (Array.isArray(rawTarget.target)) {
			return rawTarget.target.filter((t) => typeof t === 'string');
		}
	}
	return [];
}

function edgeContainerIdFor(sourceId, targetId) {
	const sourceParent = sourceId.split('__').slice(0, -1);
	const targetParent = targetId.split('__').slice(0, -1);
	const n = Math.min(sourceParent.length, targetParent.length);

	let i = 0;
	while (i < n && sourceParent[i] === targetParent[i]) {
		i += 1;
	}

	return sourceParent.slice(0, i).join('__');
}

function pushEdge(edgeBuckets, containerId, edge) {
	if (!edgeBuckets.has(containerId)) {
		edgeBuckets.set(containerId, []);
	}
	edgeBuckets.get(containerId).push(edge);
}

function buildStateIdIndex(states, parentId, stateIdIndex) {
	for (const [name, def] of Object.entries(states)) {
		if (!def) continue;
		const nodeId = parentId ? `${parentId}__${name}` : name;
		if (typeof def.id === 'string' && def.id.trim()) {
			stateIdIndex.set(def.id.trim(), nodeId);
		}
		if (def.states && Object.keys(def.states).length) {
			buildStateIdIndex(def.states, nodeId, stateIdIndex);
		}
	}
}

function buildElkGraph(states, parentId, tree, edgeBuckets, stateIdIndex) {
	const elkNodes = [];

	for (const [name, def] of Object.entries(states)) {
		if (!def) continue;
		const id = parentId ? `${parentId}__${name}` : name;
		const isCompound = !!(def.states && Object.keys(def.states).length);
		const dims = nodeDimensions(name, def, isCompound);

		const elkNode = {
			id,
			width: dims.width,
			height: dims.height,
			labels: [{ text: name }],
			layoutOptions: isCompound ? { ...ELK_OPTS } : {},
		};

		if (isCompound) {
			const { children, edges: innerEdges } = buildElkGraph(
				def.states,
				id,
				tree,
				edgeBuckets,
				stateIdIndex
			);
			elkNode.children = children;
			if (innerEdges.length) {
				elkNode.edges = innerEdges;
			}
		}

		elkNodes.push(elkNode);

		if (def.on) {
			for (const [event, rawTarget] of Object.entries(def.on)) {
				const targets = extractTargets(rawTarget);
				for (const target of targets) {
					const resolvedTarget = resolveTargetId(
						target,
						parentId,
						tree,
						states,
						stateIdIndex
					);
					if (!resolvedTarget) continue;
					const edge = {
						id: `${id}->${resolvedTarget}__${event}`,
						sources: [id],
						targets: [resolvedTarget],
						labels: [{ text: event }],
						_event: event,
					};

					const containerId = edgeContainerIdFor(id, resolvedTarget);
					pushEdge(edgeBuckets, containerId, edge);
				}
			}
		}
	}

	const currentContainerId = parentId ?? '';
	return {
		children: elkNodes,
		edges: edgeBuckets.get(currentContainerId) ?? [],
	};
}

function buildEdgePath(edge, parentNode) {
	const ox = parentNode._absX ?? 0;
	const oy = parentNode._absY ?? 0;

	if (!edge.sections?.length) return '';

	const parts = [];
	for (const section of edge.sections) {
		const sp = section.startPoint;
		parts.push(`M${sp.x + ox},${sp.y + oy}`);

		if (section.bendPoints?.length) {
			for (const bp of section.bendPoints) {
				parts.push(`L${bp.x + ox},${bp.y + oy}`);
			}
		}
		const ep = section.endPoint;
		parts.push(`L${ep.x + ox},${ep.y + oy}`);
	}
	return parts.join(' ');
}

function getEdgeLabelPoint(edge, parentNode) {
	const ox = parentNode._absX ?? 0;
	const oy = parentNode._absY ?? 0;
	if (!edge.sections?.length) return { x: ox, y: oy };

	const bendPoints = [];
	for (const section of edge.sections) {
		for (const bp of section.bendPoints || []) {
			bendPoints.push({ x: bp.x + ox, y: bp.y + oy });
		}
	}

	// For orthogonal routing, place labels on a bend (corner) instead of
	// on straight segments so event names are anchored at 90-degree turns.
	if (bendPoints.length) {
		return bendPoints[Math.floor(bendPoints.length / 2)];
	}

	const polyline = [];
	for (const section of edge.sections) {
		const pts = [
			section.startPoint,
			...(section.bendPoints || []),
			section.endPoint,
		];
		for (const p of pts) {
			if (!p) continue;
			polyline.push({ x: p.x + ox, y: p.y + oy });
		}
	}

	if (polyline.length < 2) {
		const p = polyline[0] || { x: ox, y: oy };
		return p;
	}

	let total = 0;
	for (let i = 1; i < polyline.length; i += 1) {
		const dx = polyline[i].x - polyline[i - 1].x;
		const dy = polyline[i].y - polyline[i - 1].y;
		total += Math.hypot(dx, dy);
	}

	if (!Number.isFinite(total) || total <= 0) {
		const mid = polyline[Math.floor(polyline.length / 2)];
		return mid;
	}

	const target = total / 2;
	let walked = 0;
	for (let i = 1; i < polyline.length; i += 1) {
		const a = polyline[i - 1];
		const b = polyline[i];
		const dx = b.x - a.x;
		const dy = b.y - a.y;
		const seg = Math.hypot(dx, dy);
		if (walked + seg >= target && seg > 0) {
			const t = (target - walked) / seg;
			return {
				x: a.x + dx * t,
				y: a.y + dy * t,
			};
		}
		walked += seg;
	}

	return polyline[polyline.length - 1];
}

function lookupDef(tree, fullId) {
	const parts = fullId.split('__');
	let cur = tree;
	for (const part of parts) {
		cur = cur?.states?.[part];
	}
	return cur ?? null;
}

function flattenElkResult(
	elkNode,
	tree,
	parentId,
	depth,
	accumNodes,
	accumEdges
) {
	if (!elkNode.children) return;

	for (const child of elkNode.children) {
		const stateName = child.labels?.[0]?.text ?? child.id;
		const rawId = child.id;
		const parentX = elkNode._absX ?? 0;
		const parentY = elkNode._absY ?? 0;
		child._absX = parentX + (child.x ?? 0);
		child._absY = parentY + (child.y ?? 0);

		const def = lookupDef(tree, rawId);
		const isCompound = !!child.children?.length;
		const color = colorFor(stateName, def);

		const entry = def?.entry
			? Array.isArray(def.entry)
				? def.entry
				: [def.entry]
			: [];
		const subtitle = entry.length ? entry.join(', ') : '';

		accumNodes.push({
			id: rawId,
			label: stateName,
			subtitle,
			x: child._absX,
			y: child._absY,
			width: child.width,
			height: child.height,
			isCompound,
			isInitial: parentId
				? tree?.states?.[parentId.split('__').pop()]?.initial ===
					stateName
				: tree?.initial === stateName,
			fill: color.fill,
			stroke: color.stroke,
			textColor: color.text,
			depth,
			parentId,
			def,
		});

		if (isCompound) {
			flattenElkResult(
				child,
				tree,
				rawId,
				depth + 1,
				accumNodes,
				accumEdges
			);
		}
	}

	if (elkNode.edges) {
		for (const edge of elkNode.edges) {
			const srcId = edge.sources?.[0];
			const dstId = edge.targets?.[0];
			if (!srcId || !dstId) continue;

			const event = edge._event ?? edge.labels?.[0]?.text ?? '';
			const isError =
				event.toLowerCase().includes('error') ||
				dstId.toLowerCase().includes('error');

			const path = buildEdgePath(edge, elkNode);

			const labelPoint = getEdgeLabelPoint(edge, elkNode);
			const labelX = labelPoint.x;
			const labelY = labelPoint.y;

			accumEdges.push({
				id: edge.id,
				sourceId: srcId,
				targetId: dstId,
				label: event,
				labelX,
				labelY,
				labelW: event.length * 6.5,
				path,
				color: isError ? PALETTE.red.stroke : '#888780',
			});
		}
	}
}

export function useStateTreeViewer() {
	const rawInput = ref('');
	const parseError = ref('');
	const layoutRunning = ref(false);
	const nodes = ref([]);
	const edges = ref([]);

	const hasGraph = computed(() => nodes.value.length > 0);

	const stats = computed(() => {
		const compound = nodes.value.filter((n) => n.isCompound).length;
		return {
			states: nodes.value.length,
			transitions: edges.value.length,
			compound,
		};
	});

	const visibleNodes = computed(() => nodes.value);

	const visibleEdges = computed(() => {
		const visIds = new Set(visibleNodes.value.map((n) => n.id));
		return edges.value.filter((e) => {
			return visIds.has(e.sourceId) && visIds.has(e.targetId);
		});
	});

	async function parse() {
		parseError.value = '';
		let tree;

		try {
			tree = parseInput(rawInput.value);
		} catch (e) {
			parseError.value = e.message;
			return;
		}

		if (!tree.states) {
			parseError.value =
				'Missing "states" key - is this a valid XState config?';
			return;
		}

		layoutRunning.value = true;

		try {
			const edgeBuckets = new Map();
			const stateIdIndex = new Map();
			if (typeof tree.id === 'string' && tree.id.trim()) {
				stateIdIndex.set(tree.id.trim(), '');
			}
			buildStateIdIndex(tree.states, null, stateIdIndex);

			const { children, edges: elkEdges } = buildElkGraph(
				tree.states,
				null,
				tree,
				edgeBuckets,
				stateIdIndex
			);

			const graph = {
				id: '__root__',
				layoutOptions: ELK_OPTS,
				children,
				edges: elkEdges,
			};

			const result = await elk.layout(graph);
			result._absX = 0;
			result._absY = 0;

			const newNodes = [];
			const newEdges = [];
			flattenElkResult(result, tree, null, 0, newNodes, newEdges);

			nodes.value = newNodes;
			edges.value = newEdges;
		} catch (e) {
			parseError.value = `Layout error: ${e.message}`;
			console.error(e);
		} finally {
			layoutRunning.value = false;
		}
	}

	return {
		rawInput,
		parseError,
		layoutRunning,
		nodes,
		edges,
		hasGraph,
		stats,
		visibleNodes,
		visibleEdges,
		parse,
	};
}
