#!/usr/bin/env node
/**
 * xstate-to-svg.js
 * Converts an XState v4 state tree config object to an SVG diagram.
 *
 * Usage:
 *   node xstate-to-svg.js <input.js>            # auto-detects exported stateTree / machine
 *   node xstate-to-svg.js <input.js> [out.svg]  # optional output path
 *
 * Input file must export (CJS or ESM) one of:
 *   module.exports = { initial, states }
 *   module.exports = { stateTree: { initial, states } }
 *   export default { initial, states }
 */

const fs = require('fs');
const path = require('path');

// ─── CLI ──────────────────────────────────────────────────────────────────────

const [, , inputArg, outputArg] = process.argv;
if (!inputArg) {
	console.error('Usage: node xstate-to-svg.js <input.js> [output.svg]');
	process.exit(1);
}

const inputFile = path.resolve(inputArg);
const outputFile = outputArg
	? path.resolve(outputArg)
	: inputFile.replace(/\.[^.]+$/, '') + '.svg';

if (!fs.existsSync(inputFile)) {
	console.error(`File not found: ${inputFile}`);
	process.exit(1);
}

// ─── Load the state tree ──────────────────────────────────────────────────────

function loadTree(file) {
	// Inline eval – safer than dynamic require for arbitrary export styles
	let src = fs.readFileSync(file, 'utf8');

	// Strip ES module syntax so we can eval in CJS context
	src = src
		.replace(/^export\s+default\s+/m, 'module.exports = ')
		.replace(/^export\s+const\s+(\w+)\s*=/m, 'const $1 = module.exports =');

	const m = { exports: {} };
	const fn = new Function(
		'module',
		'exports',
		'require',
		'__dirname',
		'__filename',
		src
	);
	fn(m, m.exports, require, path.dirname(file), file);

	const exp = m.exports;
	if (exp && exp.initial && exp.states) return exp;
	if (exp && exp.stateTree) return exp.stateTree;
	if (exp && exp.default && exp.default.initial) return exp.default;
	// Try every named export
	for (const v of Object.values(exp)) {
		if (v && typeof v === 'object' && v.initial && v.states) return v;
	}
	throw new Error(
		'Could not find a state tree in the exported value. Make sure it has { initial, states }.'
	);
}

const tree = loadTree(inputFile);

// ─── Design tokens ────────────────────────────────────────────────────────────

const COLORS = {
	teal: { fill: '#E1F5EE', stroke: '#0F6E56', text: '#085041' },
	amber: { fill: '#FAEEDA', stroke: '#854F0B', text: '#633806' },
	red: { fill: '#FCEBEB', stroke: '#A32D2D', text: '#791F1F' },
	gray: { fill: '#F1EFE8', stroke: '#5F5E5A', text: '#444441' },
	purple: { fill: '#EEEDFE', stroke: '#534AB7', text: '#3C3489' },
	coral: { fill: '#FAECE7', stroke: '#993C1D', text: '#712B13' },
	blue: { fill: '#E6F1FB', stroke: '#185FA5', text: '#0C447C' },
};

const FONT = '"Helvetica Neue", Arial, sans-serif';
const W = 680; // viewBox width – load-bearing, do not change
const PAD = 40; // outer margin
const BOX_H = 44; // single-line node height
const BOX_H2 = 58; // two-line node height
const BOX_W = 160; // default node width
const GAP_X = 24; // horizontal gap between siblings
const GAP_Y = 50; // vertical gap between levels
const CONT_PAD = 22; // padding inside compound state containers

// ─── Classify states ──────────────────────────────────────────────────────────

function classifyState(name, stateDef) {
	const lower = name.toLowerCase();
	if (lower.includes('error')) return 'red';
	if (
		lower.includes('disabled') ||
		lower.includes('disconnect') ||
		lower.includes('retry') ||
		lower.includes('cancel')
	)
		return 'amber';
	if (
		lower.includes('idle') ||
		(lower.includes('init') && !lower.includes('error'))
	)
		return 'gray';
	if (stateDef && stateDef.states) {
		// compound containers cycle through purple/coral/blue
		return 'purple';
	}
	return 'teal';
}

function isCompound(def) {
	return (
		def &&
		typeof def.states === 'object' &&
		Object.keys(def.states).length > 0
	);
}

// ─── Layout engine ────────────────────────────────────────────────────────────
// Builds a flat list of positioned nodes + edges.

let nodeId = 0;
const nodes = []; // { id, name, def, x, y, w, h, color, parentId, depth }
const edges = []; // { from, to, label, color }

function buildLayout(states, parentId, startX, startY, availW) {
	const names = Object.keys(states);
	if (!names.length) return startY;

	// Split into compound and leaf nodes for two-pass layout
	const leaves = names.filter((n) => !isCompound(states[n]));
	const compounds = names.filter((n) => isCompound(states[n]));

	let curY = startY;

	// ── Leaf nodes: lay out in rows of up to 3 ──────────────────────────────
	if (leaves.length) {
		const cols = Math.min(leaves.length, 3);
		const boxW = Math.min(
			BOX_W,
			Math.floor((availW - GAP_X * (cols - 1)) / cols)
		);
		const rowW = cols * boxW + (cols - 1) * GAP_X;
		const rowX = startX + Math.floor((availW - rowW) / 2);

		for (let i = 0; i < leaves.length; i++) {
			const col = i % cols;
			const row = Math.floor(i / cols);
			const name = leaves[i];
			const def = states[name];
			const color = classifyState(name, def);
			const hasEntry = def && (def.entry || def.exit);
			const h = hasEntry ? BOX_H2 : BOX_H;
			const x = rowX + col * (boxW + GAP_X);
			const y = curY + row * (h + GAP_Y);
			const id = ++nodeId;
			nodes.push({
				id,
				name,
				def,
				x,
				y,
				w: boxW,
				h,
				color,
				parentId,
				depth: 0,
			});

			if (col === cols - 1 || i === leaves.length - 1) {
				// end of row
				curY = y + h + GAP_Y;
			}
		}
	}

	// ── Compound states: each gets its own full-width block ─────────────────
	for (const name of compounds) {
		const def = states[name];
		const color = 'purple';
		const id = ++nodeId;
		const innerStartX = startX + CONT_PAD;
		const innerAvailW = availW - CONT_PAD * 2;
		const innerStartY = curY + CONT_PAD + 32; // 32 = header text height

		// Reserve space and recurse
		const innerEndY = buildLayout(
			def.states,
			id,
			innerStartX,
			innerStartY,
			innerAvailW
		);

		const contH = innerEndY - curY + CONT_PAD;
		nodes.push({
			id,
			name,
			def,
			x: startX,
			y: curY,
			w: availW,
			h: contH,
			color,
			parentId,
			depth: 1,
		});
		curY = curY + contH + GAP_Y;
	}

	return curY;
}

const innerW = W - PAD * 2;
const totalH = buildLayout(tree.states, null, PAD, PAD, innerW);

// ─── Build edges ──────────────────────────────────────────────────────────────
// Walk all nodes and extract transitions.

function nodeByName(name, preferParentId) {
	// Prefer nodes with matching parentId (scoped substates), else fall back
	const scoped = nodes.filter(
		(n) => n.name === name && n.parentId === preferParentId
	);
	if (scoped.length) return scoped[0];
	return nodes.find((n) => n.name === name) || null;
}

function addEdges(states, parentId) {
	for (const [name, def] of Object.entries(states)) {
		if (!def) continue;
		const src = nodeByName(name, parentId);
		if (!src) continue;

		if (def.on) {
			for (const [event, target] of Object.entries(def.on)) {
				if (!target) continue;
				const dst =
					nodeByName(target, parentId) || nodeByName(target, null);
				if (!dst) continue;
				const isError =
					event.toLowerCase().includes('error') ||
					target.toLowerCase().includes('error');
				edges.push({
					from: src.id,
					to: dst.id,
					label: event.length > 16 ? event.slice(0, 14) + '…' : event,
					color: isError ? COLORS.red.stroke : '#888780',
				});
			}
		}

		if (isCompound(def)) {
			addEdges(def.states, src.id);
		}
	}
}

addEdges(tree.states, null);

// ─── SVG helpers ─────────────────────────────────────────────────────────────

function esc(s) {
	return String(s)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function cx(node) {
	return node.x + node.w / 2;
}
function cy(node) {
	return node.y + node.h / 2;
}

// Simple straight edge with a mid-label; avoids through-box routing heuristic
function edgePath(src, dst) {
	const x1 = cx(src),
		y1 = src.y + src.h;
	const x2 = cx(dst),
		y2 = dst.y;
	if (y2 > y1) {
		// forward / downward
		return `M${x1},${y1} C${x1},${(y1 + y2) / 2} ${x2},${(y1 + y2) / 2} ${x2},${y2}`;
	}
	// backward / upward – route around to the right
	const rx = Math.max(cx(src), cx(dst)) + 60;
	return `M${x1},${src.y + src.h / 2} C${rx},${src.y + src.h / 2} ${rx},${dst.y + dst.h / 2} ${x2},${dst.y + dst.h / 2}`;
}

// ─── SVG render ───────────────────────────────────────────────────────────────

function renderNode(n) {
	const c = COLORS[n.color] || COLORS.teal;
	const rx = n.depth === 1 ? 12 : 8;
	const isCompoundContainer = isCompound(n.def);
	const label = esc(n.name);

	const entryActions =
		n.def && n.def.entry
			? (Array.isArray(n.def.entry) ? n.def.entry : [n.def.entry]).join(
					', '
				)
			: null;
	const subtitle = entryActions
		? esc(
				entryActions.length > 28
					? entryActions.slice(0, 26) + '…'
					: entryActions
			)
		: null;

	let inner = '';

	if (isCompoundContainer) {
		// Just a header label at the top of the container rect
		inner = `
    <text
      font-family="${FONT}" font-size="14" font-weight="500"
      fill="${c.text}"
      x="${n.x + n.w / 2}" y="${n.y + 20}"
      text-anchor="middle" dominant-baseline="central">${label}</text>`;
	} else {
		const textY = subtitle ? n.y + 18 : n.y + n.h / 2;
		inner = `
    <text
      font-family="${FONT}" font-size="13" font-weight="500"
      fill="${c.text}"
      x="${n.x + n.w / 2}" y="${textY}"
      text-anchor="middle" dominant-baseline="central">${label}</text>`;
		if (subtitle) {
			inner += `
    <text
      font-family="${FONT}" font-size="11" font-weight="400"
      fill="${c.stroke}"
      x="${n.x + n.w / 2}" y="${n.y + n.h - 14}"
      text-anchor="middle" dominant-baseline="central">${subtitle}</text>`;
		}
	}

	return `
  <g>
    <rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="${rx}"
      fill="${c.fill}" stroke="${c.stroke}" stroke-width="0.5"/>
    ${inner}
  </g>`;
}

function renderEdge(e) {
	const src = nodes.find((n) => n.id === e.from);
	const dst = nodes.find((n) => n.id === e.to);
	if (!src || !dst) return '';

	const d = edgePath(src, dst);
	const mx = (cx(src) + cx(dst)) / 2;
	const my = (src.y + src.h + dst.y) / 2;

	return `
  <path d="${d}" fill="none" stroke="${e.color}" stroke-width="1" opacity="0.7"
    marker-end="url(#arrow)"/>
  <text font-family="${FONT}" font-size="10" fill="${e.color}" opacity="0.85"
    x="${mx}" y="${my}" text-anchor="middle">${esc(e.label)}</text>`;
}

// Render compound containers first (back), then leaves (front)
const compoundNodes = nodes.filter((n) => isCompound(n.def));
const leafNodes = nodes.filter((n) => !isCompound(n.def));

const svgH = Math.ceil(totalH) + PAD;

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
  width="100%" viewBox="0 0 ${W} ${svgH}"
  role="img">
  <title>XState diagram</title>
  <desc>Auto-generated state machine diagram</desc>

  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5"
      markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M2 1L8 5L2 9" fill="none" stroke="context-stroke"
        stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </marker>
  </defs>

  <!-- background -->
  <rect width="${W}" height="${svgH}" fill="#ffffff"/>

  <!-- compound containers -->
  ${compoundNodes.map(renderNode).join('')}

  <!-- edges -->
  ${edges.map(renderEdge).join('')}

  <!-- leaf nodes -->
  ${leafNodes.map(renderNode).join('')}

  <!-- legend -->
  ${renderLegend(svgH - 30)}
</svg>`;

function renderLegend(y) {
	const items = [
		{ color: 'teal', label: 'Active / processing' },
		{ color: 'amber', label: 'Retry / disconnect' },
		{ color: 'red', label: 'Error' },
		{ color: 'gray', label: 'Idle / start' },
		{ color: 'purple', label: 'Compound state' },
	];
	let out = `<g opacity="0.7">`;
	items.forEach((item, i) => {
		const c = COLORS[item.color];
		const lx = PAD + i * 130;
		out += `
    <rect x="${lx}" y="${y - 8}" width="12" height="12" rx="2"
      fill="${c.fill}" stroke="${c.stroke}" stroke-width="0.5"/>
    <text font-family="${FONT}" font-size="10" fill="#5F5E5A"
      x="${lx + 16}" y="${y + 3}">${esc(item.label)}</text>`;
	});
	out += `</g>`;
	return out;
}

// ─── Write output ─────────────────────────────────────────────────────────────

fs.writeFileSync(outputFile, svg, 'utf8');
console.log(`✓ SVG written to ${outputFile}`);
