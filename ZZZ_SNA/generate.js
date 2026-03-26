// ZZZ SNA HTML Generator
const fs = require('fs');

function parseCSV(text) {
  const lines = text.trim().split('\n');
  const headers = lines[0].replace(/\r/g, '').split(',').map(h => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].replace(/\r/g, '');
    const vals = [];
    let cur = '', inQ = false;
    for (const c of line) {
      if (c === '"') inQ = !inQ;
      else if (c === ',' && !inQ) { vals.push(cur); cur = ''; }
      else cur += c;
    }
    vals.push(cur);
    const row = {};
    headers.forEach((h, i) => row[h] = (vals[i] || '').trim());
    rows.push(row);
  }
  return rows;
}

function splitMulti(s) {
  if (!s || s === '-') return [];
  return s.split(',').map(x => x.trim()).filter(Boolean);
}

function normalizeDamage(d) {
  if (!d || d === '-') return [];
  d = d.replace('전기 속성 피해', '전기 피해');
  return d.split(',').map(s => s.trim()).filter(Boolean);
}

function normalizeVersion(v) {
  const match = v.match(/(\d+\.\d+)/);
  return match ? match[1] : v;
}

const agentRaw = parseCSV(fs.readFileSync('D:/Claude/ZZZ_SNA/ZZZ 에이전트 db01.csv', 'utf-8'));
const skillRaw = parseCSV(fs.readFileSync('D:/Claude/ZZZ_SNA/ZZZ 스킬 db01.csv', 'utf-8'));

const agentData = agentRaw.map(a => ({
  name: a['에이전트명'],
  element: a['속성'],
  faction: a['진영'],
  version: normalizeVersion(a['출시버전']),
  rawVersion: a['출시버전'],
  cls: a['클래스'],
  note: a['비고'] || ''
}));

const skillData = skillRaw.map(s => ({
  name: s['이름'],
  agent: s['ZZZ 에이전트'],
  major: s['대분류'],
  minor: s['소분류'],
  damage: normalizeDamage(s['피해유형']),
  effects: splitMulti(s['부가효과']),
  reactions: splitMulti(s['리액션 태그']),
  resource: s['소모 자원'] || '',
  buff: s['전용 버프'] || '',
  synergies: splitMulti(s['시너지'])
}));

const versions = [...new Set(agentData.map(a => a.version))].sort((a, b) => {
  const na = parseFloat(a), nb = parseFloat(b);
  return na - nb;
});

const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ZZZ 스킬 소셜 네트워크 분석</title>
<script src="https://d3js.org/d3.v7.min.js"></script>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', sans-serif; background: #0d1117; color: #e6edf3; height: 100vh; display: flex; flex-direction: column; overflow: hidden; }

  #header { background: #161b22; border-bottom: 1px solid #30363d; padding: 10px 20px; display: flex; align-items: center; gap: 20px; flex-shrink: 0; }
  #header h1 { font-size: 16px; color: #58a6ff; font-weight: 600; white-space: nowrap; }
  #header .stats { font-size: 12px; color: #8b949e; }

  #main { display: flex; flex: 1; overflow: hidden; }

  #sidebar { width: 220px; background: #161b22; border-right: 1px solid #30363d; padding: 12px; overflow-y: auto; flex-shrink: 0; display: flex; flex-direction: column; gap: 14px; }

  .panel-title { font-size: 11px; font-weight: 700; color: #8b949e; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }

  .ver-dropdown { width: 100%; padding: 6px 10px; border-radius: 5px; border: 1px solid #30363d; background: #0d1117; color: #c9d1d9; font-size: 12px; cursor: pointer; appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%238b949e'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 10px center; padding-right: 28px; outline: none; }
  .ver-dropdown:hover, .ver-dropdown:focus { border-color: #58a6ff; }
  .ver-dropdown option { background: #161b22; color: #c9d1d9; }
  .ver-selected-info { margin-top: 6px; font-size: 11px; color: #58a6ff; min-height: 16px; }

  .elem-filter { display: flex; flex-direction: column; gap: 4px; }
  .elem-btn { padding: 5px 8px; border-radius: 4px; border: 1px solid #30363d; background: #0d1117; color: #8b949e; font-size: 11px; cursor: pointer; display: flex; align-items: center; gap: 7px; transition: all 0.15s; user-select: none; }
  .elem-btn .dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
  .elem-btn.active { border-color: currentColor; background: #1a1f2e; }
  .elem-btn:not(.active) { opacity: 0.45; }
  .elem-btn:hover { opacity: 1; }

  /* 클릭 요약 패널 */
  #info-panel { border-top: 1px solid #30363d; padding-top: 12px; display: none; flex-direction: column; gap: 6px; }
  #info-panel.visible { display: flex; }
  .info-badge { display: inline-block; padding: 2px 7px; border-radius: 10px; font-size: 10px; font-weight: 600; margin-bottom: 2px; }
  .info-name { font-size: 13px; font-weight: 700; color: #e6edf3; line-height: 1.3; word-break: keep-all; }
  .info-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 4px; font-size: 11px; }
  .info-label { color: #8b949e; white-space: nowrap; flex-shrink: 0; }
  .info-val { color: #c9d1d9; text-align: right; word-break: keep-all; }
  .info-tags { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 2px; }
  .info-tag { padding: 1px 5px; border-radius: 3px; font-size: 10px; background: #21262d; color: #c9d1d9; border: 1px solid #30363d; }
  .info-divider { border: none; border-top: 1px solid #21262d; margin: 2px 0; }

  .legend { display: flex; flex-direction: column; gap: 4px; }
  .legend-item { display: flex; align-items: center; gap: 6px; font-size: 11px; color: #8b949e; }
  .legend-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
  .legend-line { width: 10px; height: 2px; border-radius: 1px; flex-shrink: 0; }

  #canvas-area { flex: 1; position: relative; overflow: hidden; }
  svg { width: 100%; height: 100%; }

  .node circle { stroke-width: 1.5px; cursor: pointer; }
  .node.agent circle { stroke-width: 2px; }
  .node text { font-size: 9px; fill: #e6edf3; pointer-events: none; text-anchor: middle; dominant-baseline: central; }
  .node.agent text { font-size: 10px; font-weight: 600; }

  .link { stroke-opacity: 0.05; transition: stroke-opacity 0.2s; }

  #tooltip {
    position: absolute; background: #161b22; border: 1px solid #30363d;
    border-radius: 6px; padding: 10px 12px; font-size: 12px; pointer-events: none;
    display: none; max-width: 240px; z-index: 100; box-shadow: 0 4px 16px #0006;
  }
  #tooltip .tt-name { font-weight: 600; color: #e6edf3; margin-bottom: 4px; }
  #tooltip .tt-row { display: flex; gap: 6px; color: #8b949e; font-size: 11px; margin-top: 2px; }
  #tooltip .tt-label { color: #8b949e; }
  #tooltip .tt-val { color: #c9d1d9; }

  #status-bar { background: #161b22; border-top: 1px solid #30363d; padding: 4px 16px; font-size: 11px; color: #8b949e; flex-shrink: 0; display: flex; gap: 16px; }

  .node.dimmed circle, .node.dimmed path { opacity: 0.10; }
  .node.dimmed text { opacity: 0.10; }
</style>
</head>
<body>

<div id="header">
  <h1>⚡ ZZZ 스킬 소셜 네트워크 분석</h1>
  <div class="stats" id="graph-stats">노드: 0 | 엣지: 0</div>
</div>

<div id="main">
  <div id="sidebar">
    <div>
      <div class="panel-title">버전 필터</div>
      <select class="ver-dropdown" id="version-dropdown" onchange="onVersionSelect(this)">
        <option value="all">전체 버전</option>
      </select>
      <div class="ver-selected-info" id="ver-selected-info"></div>
    </div>

    <div>
      <div class="panel-title">에이전트 속성 필터</div>
      <div class="elem-filter" id="elem-filter"></div>
    </div>

    <div>
      <div class="panel-title">범례 — 스킬 대분류</div>
      <div class="legend">
        <div class="legend-item"><div class="legend-dot" style="background:#388bfd"></div> 핵심스킬</div>
        <div class="legend-item"><div class="legend-dot" style="background:#d29922"></div> 궁극기</div>
        <div class="legend-item"><div class="legend-dot" style="background:#6f42c1"></div> 콤보공격</div>
        <div class="legend-item"><div class="legend-dot" style="background:#e8542a"></div> 특수스킬</div>
        <div class="legend-item"><div class="legend-dot" style="background:#2ea043"></div> 지원스킬</div>
        <div class="legend-item"><div class="legend-dot" style="background:#1f6feb"></div> 회피스킬</div>
        <div class="legend-item"><div class="legend-dot" style="background:#6e7681"></div> 일반공격</div>
      </div>
    </div>

    <div>
      <div class="panel-title">범례 — 속성 노드</div>
      <div class="legend">
        <div class="legend-item"><div class="legend-dot" style="background:#ff7b7b; border-radius:2px"></div> 피해 유형</div>
        <div class="legend-item"><div class="legend-dot" style="background:#1a7f37; border-radius:2px"></div> 부가 효과</div>
        <div class="legend-item"><div class="legend-dot" style="background:#7ee787; border-radius:2px"></div> 리액션 태그</div>
        <div class="legend-item"><div class="legend-dot" style="background:#56d364; border-radius:2px"></div> 시너지</div>
      </div>
    </div>

    <div id="info-panel">
      <div class="panel-title">선택 정보</div>
      <div id="info-content"></div>
    </div>
  </div>

  <div id="canvas-area">
    <svg id="graph"></svg>
    <div id="tooltip"></div>
  </div>
</div>

<div id="status-bar">
  <span id="status-nodes">에이전트: 0</span>
  <span id="status-skills">스킬: 0</span>
  <span id="status-attrs">속성 노드: 0</span>
  <span style="margin-left:auto; color:#444c56">드래그: 이동 | 스크롤: 줌 | 노드 클릭: 강조</span>
</div>

<script>
const AGENTS = ${JSON.stringify(agentData)};
const SKILLS = ${JSON.stringify(skillData)};
const VERSIONS = ${JSON.stringify(versions)};

// Color maps
const elementColor = {
  '물리': '#c0c0c0', '불': '#e05c2a', '얼음': '#5bc4f5',
  '전기': '#f5d542', '에테르': '#b06adb'
};
const majorColor = {
  '핵심스킬': '#388bfd', '궁극기': '#d29922', '콤보공격': '#6f42c1',
  '특수스킬': '#e8542a', '지원스킬': '#2ea043', '회피스킬': '#1f6feb', '일반공격': '#6e7681'
};
const attrColor = {
  damage: '#ff7b7b', effects: '#1a7f37', reactions: '#7ee787', synergies: '#56d364'
};
const attrBorder = {
  damage: '#cc3333', effects: '#0d4a1e', reactions: '#2ea043', synergies: '#1a7f37'
};

// State
let selectedVersions = new Set(VERSIONS);
let selectedElements = new Set(['물리', '불', '얼음', '전기', '에테르']);
let simulation = null;
let highlightedNodeId = null;
let currentLinks = [];  // 하이라이트용 현재 링크 캐시

// 버전 드롭다운 — 내림차순 정렬
const dropdown = document.getElementById('version-dropdown');
const VERSIONS_DESC = [...VERSIONS].reverse();
VERSIONS_DESC.forEach(v => {
  const opt = document.createElement('option');
  opt.value = v;
  opt.textContent = 'v' + v + ' 이하';
  dropdown.appendChild(opt);
});

function onVersionSelect(sel) {
  const val = sel.value;
  if (val === 'all') {
    selectedVersions = new Set(VERSIONS);
    document.getElementById('ver-selected-info').textContent = '전체 ' + VERSIONS.length + '개 버전';
  } else {
    // 선택 버전 이하(오름차순 기준 앞쪽) 모두 포함
    const idx = VERSIONS.indexOf(val);
    selectedVersions = new Set(VERSIONS.slice(0, idx + 1));
    const count = selectedVersions.size;
    document.getElementById('ver-selected-info').textContent =
      'v' + VERSIONS[0] + ' ~ v' + val + ' (' + count + '개)';
  }
  rebuildGraph();
}
// 에이전트 속성 필터 버튼 생성
const elemDefs = [
  { key: '물리', color: '#c0c0c0' },
  { key: '불',   color: '#e05c2a' },
  { key: '얼음', color: '#5bc4f5' },
  { key: '전기', color: '#f5d542' },
  { key: '에테르', color: '#b06adb' }
];
const elemFilter = document.getElementById('elem-filter');
elemDefs.forEach(({ key, color }) => {
  const btn = document.createElement('div');
  btn.className = 'elem-btn active';
  btn.dataset.element = key;
  btn.style.color = color;
  btn.innerHTML = \`<span class="dot" style="background:\${color}"></span>\${key}\`;
  btn.onclick = () => {
    btn.classList.toggle('active');
    if (btn.classList.contains('active')) selectedElements.add(key);
    else selectedElements.delete(key);
    rebuildGraph();
  };
  elemFilter.appendChild(btn);
});

// SVG setup
const svg = d3.select('#graph');
const container = document.getElementById('canvas-area');
let width = container.clientWidth;
let height = container.clientHeight;

const g = svg.append('g');
const linkG = g.append('g').attr('class', 'links');
const nodeG = g.append('g').attr('class', 'nodes');

svg.call(d3.zoom().scaleExtent([0.1, 8]).on('zoom', e => {
  g.attr('transform', e.transform);
}));

window.addEventListener('resize', () => {
  width = container.clientWidth;
  height = container.clientHeight;
  if (simulation) simulation.force('center', d3.forceCenter(width / 2, height / 2)).restart();
});

// Tooltip
const tooltip = document.getElementById('tooltip');

function showTooltip(event, d) {
  let html = \`<div class="tt-name">\${d.label}</div>\`;
  if (d.type === 'agent') {
    html += \`<div class="tt-row"><span class="tt-label">속성</span><span class="tt-val">\${d.data.element}</span></div>\`;
    html += \`<div class="tt-row"><span class="tt-label">진영</span><span class="tt-val">\${d.data.faction}</span></div>\`;
    html += \`<div class="tt-row"><span class="tt-label">클래스</span><span class="tt-val">\${d.data.cls}</span></div>\`;
    html += \`<div class="tt-row"><span class="tt-label">버전</span><span class="tt-val">\${d.data.rawVersion}</span></div>\`;
  } else if (d.type === 'skill') {
    html += \`<div class="tt-row"><span class="tt-label">에이전트</span><span class="tt-val">\${d.data.agent}</span></div>\`;
    html += \`<div class="tt-row"><span class="tt-label">분류</span><span class="tt-val">\${d.data.major} / \${d.data.minor}</span></div>\`;
    if (d.data.damage.length) html += \`<div class="tt-row"><span class="tt-label">피해</span><span class="tt-val">\${d.data.damage.join(', ')}</span></div>\`;
    if (d.data.effects.length) html += \`<div class="tt-row"><span class="tt-label">효과</span><span class="tt-val">\${d.data.effects.slice(0,4).join(', ')}\${d.data.effects.length>4?' ...':''}</span></div>\`;
    if (d.data.reactions.length) html += \`<div class="tt-row"><span class="tt-label">리액션</span><span class="tt-val">\${d.data.reactions.join(', ')}</span></div>\`;
    if (d.data.synergies.length) html += \`<div class="tt-row"><span class="tt-label">시너지</span><span class="tt-val">\${d.data.synergies.join(', ')}</span></div>\`;
  } else {
    const typeLabel = {damage:'피해유형', effects:'부가효과', reactions:'리액션 태그', synergies:'시너지'}[d.attrType];
    html += \`<div class="tt-row"><span class="tt-label">유형</span><span class="tt-val">\${typeLabel}</span></div>\`;
    html += \`<div class="tt-row"><span class="tt-label">연결 스킬 수</span><span class="tt-val">\${d.skillCount || 0}</span></div>\`;
  }
  tooltip.innerHTML = html;
  tooltip.style.display = 'block';
  moveTooltip(event);
}

function moveTooltip(event) {
  const rect = container.getBoundingClientRect();
  let x = event.clientX - rect.left + 12;
  let y = event.clientY - rect.top + 12;
  if (x + 250 > rect.width) x = event.clientX - rect.left - 262;
  if (y + 120 > rect.height) y = event.clientY - rect.top - 130;
  tooltip.style.left = x + 'px';
  tooltip.style.top = y + 'px';
}

function hideTooltip() { tooltip.style.display = 'none'; }

// Main graph build
function rebuildGraph() {
  highlightedNodeId = null;
  clearInfoPanel();
  const visibleAgents = AGENTS.filter(a =>
    selectedVersions.has(a.version) && selectedElements.has(a.element));
  const visibleAgentNames = new Set(visibleAgents.map(a => a.name));
  const visibleSkills = SKILLS.filter(s => visibleAgentNames.has(s.agent));

  // Build attribute nodes
  const attrMap = new Map(); // id → node

  function addAttr(type, value) {
    const id = 'attr_' + type + '_' + value;
    if (!attrMap.has(id)) {
      attrMap.set(id, { id, type: 'attr', attrType: type, label: value, skillCount: 0,
        x: width/2 + (Math.random()-0.5)*300, y: height/2 + (Math.random()-0.5)*300 });
    }
    attrMap.get(id).skillCount++;
  }

  for (const s of visibleSkills) {
    s.damage.forEach(d => addAttr('damage', d));
    s.effects.forEach(e => addAttr('effects', e));
    s.reactions.forEach(r => addAttr('reactions', r));
    s.synergies.forEach(sy => addAttr('synergies', sy));
  }

  // Build nodes array
  const agentNodes = visibleAgents.map(a => ({
    id: 'agent_' + a.name,
    type: 'agent',
    label: a.name,
    data: a,
    r: 14
  }));

  const skillNodes = visibleSkills.map((s, i) => ({
    id: 'skill_' + s.agent + '_' + i,
    type: 'skill',
    label: s.name,
    data: s,
    agentId: 'agent_' + s.agent,
    r: 4
  }));

  const attrNodes = [...attrMap.values()];

  const nodes = [...agentNodes, ...skillNodes, ...attrNodes];

  // Build links
  const links = [];
  const skillIdxMap = new Map(skillNodes.map(s => [s.id, s]));

  for (const sn of skillNodes) {
    links.push({ source: sn.agentId, target: sn.id, type: 'agent-skill' });
    const s = sn.data;
    const addLink = (type, value) => {
      const attrId = 'attr_' + type + '_' + value;
      if (attrMap.has(attrId)) links.push({ source: sn.id, target: attrId, type: 'skill-attr', attrType: type });
    };
    s.damage.forEach(d => addLink('damage', d));
    s.effects.forEach(e => addLink('effects', e));
    s.reactions.forEach(r => addLink('reactions', r));
    s.synergies.forEach(sy => addLink('synergies', sy));
  }

  // Update status
  document.getElementById('graph-stats').textContent = \`노드: \${nodes.length} | 엣지: \${links.length}\`;
  document.getElementById('status-nodes').textContent = \`에이전트: \${agentNodes.length}\`;
  document.getElementById('status-skills').textContent = \`스킬: \${skillNodes.length}\`;
  document.getElementById('status-attrs').textContent = \`속성 노드: \${attrNodes.length}\`;

  // Preserve positions of existing nodes
  const existingPos = new Map();
  if (simulation) {
    simulation.nodes().forEach(n => {
      if (n.x !== undefined) existingPos.set(n.id, { x: n.x, y: n.y, vx: n.vx, vy: n.vy });
    });
    simulation.stop();
  }

  nodes.forEach(n => {
    const prev = existingPos.get(n.id);
    if (prev) { n.x = prev.x; n.y = prev.y; n.vx = prev.vx; n.vy = prev.vy; }
    else if (!n.x) { n.x = width/2 + (Math.random()-0.5)*200; n.y = height/2 + (Math.random()-0.5)*200; }
  });

  // D3 simulation
  const nodeById = new Map(nodes.map(n => [n.id, n]));
  const resolvedLinks = links.map(l => ({
    ...l,
    source: nodeById.get(l.source) || l.source,
    target: nodeById.get(l.target) || l.target
  })).filter(l => l.source && l.target && typeof l.source === 'object' && typeof l.target === 'object');

  // 속성 타입별 중요도 스케일: 부가효과 > 피해유형 > (에이전트) > 시너지 > 리액션태그
  const attrChargeStr = { effects: -160, damage: -110, synergies: -70, reactions: -45 };
  const attrLinkDist  = { effects:  55,  damage:  75,  synergies:  90, reactions: 105 };

  simulation = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(resolvedLinks).id(d => d.id)
      .distance(d => {
        if (d.type === 'agent-skill') return 35;
        return attrLinkDist[d.attrType] || 70;
      })
      .strength(d => d.type === 'agent-skill' ? 1.2 : 0.6))
    .force('charge', d3.forceManyBody()
      .strength(d => {
        if (d.type === 'agent') return -250;
        if (d.type === 'skill') return -20;
        return attrChargeStr[d.attrType] || -80;
      }))
    .force('center', d3.forceCenter(width / 2, height / 2).strength(0.05))
    .force('collision', d3.forceCollide().radius(d => {
      if (d.type === 'agent') return 22;
      if (d.type === 'skill') return 6;
      return attrNodeRadius(d) + 4;
    }))
    .alphaDecay(0.025)
    .velocityDecay(0.4);

  // 링크 캐시 갱신
  currentLinks = resolvedLinks;

  // Render
  renderGraph(nodes, resolvedLinks);

  simulation.on('tick', () => {
    linkG.selectAll('.link')
      .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x).attr('y2', d => d.target.y);

    nodeG.selectAll('.node')
      .attr('transform', d => \`translate(\${d.x},\${d.y})\`);
  });
}

// 중요도별 속성 노드 반지름 계산
const ATTR_RADIUS_MIN   = 6;
const ATTR_RADIUS_SCALE = 3;
const attrRadiusMax = { effects: 32, damage: 26, synergies: 20, reactions: 14 };

function attrNodeRadius(d) {
  const max = attrRadiusMax[d.attrType] || 18;
  return Math.min(max, ATTR_RADIUS_MIN + Math.sqrt(d.skillCount || 1) * ATTR_RADIUS_SCALE);
}

// 피해유형 → 속성 색상 매핑
const damageColor = {
  '물리 피해': '#c0c0c0',
  '불 피해':   '#e05c2a',
  '얼음 피해': '#5bc4f5',
  '전기 피해': '#f5d542',
  '에테르 피해': '#b06adb'
};
function getDamageColor(label) {
  return damageColor[label] || '#ff7b7b';
}

// 오각형 path 생성 (반지름 r)
function pentagonPath(r) {
  const pts = Array.from({length: 5}, (_, i) => {
    const a = (i * 2 * Math.PI / 5) - Math.PI / 2;
    return (r * Math.cos(a)).toFixed(2) + ',' + (r * Math.sin(a)).toFixed(2);
  });
  return 'M' + pts.join('L') + 'Z';
}

function nodeColor(d) {
  if (d.type === 'agent') return elementColor[d.data.element] || '#888';
  if (d.type === 'skill') return majorColor[d.data.major] || '#888';
  if (d.type === 'attr' && d.attrType === 'damage') return getDamageColor(d.label);
  return attrColor[d.attrType] || '#888';
}

function renderGraph(nodes, links) {
  // Links
  const linkSel = linkG.selectAll('.link').data(links, d => d.source.id + '-' + d.target.id);
  linkSel.exit().remove();
  const linkEnter = linkSel.enter().append('line').attr('class', d => 'link ' + d.type);
  linkSel.merge(linkEnter)
    .attr('stroke', d => {
      if (d.type === 'agent-skill') return '#6e7681';
      if (d.attrType === 'damage') return getDamageColor(d.target.label || '');
      return attrColor[d.attrType] || '#888';
    })
    .attr('stroke-width', d => d.type === 'agent-skill' ? 1 : 0.8)
    .attr('stroke-opacity', 0.05);

  // Nodes
  const nodeSel = nodeG.selectAll('.node').data(nodes, d => d.id);
  nodeSel.exit().remove();

  const nodeEnter = nodeSel.enter().append('g')
    .attr('class', d => 'node ' + d.type)
    .call(d3.drag()
      .on('start', dragStarted)
      .on('drag', dragged)
      .on('end', dragEnded))
    .on('mouseenter', (e, d) => showTooltip(e, d))
    .on('mousemove', (e, d) => moveTooltip(e))
    .on('mouseleave', hideTooltip)
    .on('click', (e, d) => {
      e.stopPropagation();
      highlightNode(d, nodes, links);
    });

  // 에이전트: 오각형 path / 나머지: 원
  nodeEnter.filter(d => d.type === 'agent').append('path');
  nodeEnter.filter(d => d.type !== 'agent').append('circle');

  // Labels
  nodeEnter.filter(d => d.type === 'agent').append('text').attr('dy', -18);
  nodeEnter.filter(d => d.type === 'attr').append('text').attr('dy', 1).style('font-size', '8px');

  const allNodes = nodeSel.merge(nodeEnter);

  // 에이전트 오각형 업데이트
  allNodes.filter(d => d.type === 'agent').select('path')
    .attr('d', pentagonPath(14))
    .attr('fill', d => nodeColor(d))
    .attr('stroke', d => d3.color(nodeColor(d)).brighter(0.6))
    .attr('stroke-width', 2);

  // 스킬 · 속성 노드 원 업데이트
  allNodes.filter(d => d.type !== 'agent').select('circle')
    .attr('r', d => d.type === 'attr' ? attrNodeRadius(d) : 4)
    .attr('fill', d => nodeColor(d))
    .attr('stroke', d => d.type === 'attr' ? d3.color(nodeColor(d)).darker(0.6) : 'none')
    .attr('stroke-width', 1)
    .attr('fill-opacity', d => d.type === 'skill' ? 0.25 : 1);

  allNodes.filter(d => d.type === 'agent').select('text')
    .text(d => d.label)
    .attr('fill', d => nodeColor(d))
    .style('font-size', '10px')
    .style('font-weight', '600')
    .style('text-shadow', '0 1px 3px #000');

  // 속성 노드 라벨 — 중요도별 폰트 크기 다르게
  const attrFontSize = { effects: '10px', damage: '9px', synergies: '8px', reactions: '7.5px' };
  allNodes.filter(d => d.type === 'attr').select('text')
    .text(d => d.label)
    .attr('fill', '#e6edf3')
    .style('font-size', d => attrFontSize[d.attrType] || '8px')
    .style('font-weight', d => d.attrType === 'effects' ? '600' : 'normal')
    .style('text-shadow', '0 1px 2px #000');
}

function getConnectedIds(d, links) {
  const ids = new Set([d.id]);

  // 1단계: 클릭 노드에 연결된 스킬 수집
  // (스킬 자신을 클릭한 경우 그 스킬 자체를 pivot으로 사용)
  const pivotSkills = new Set();
  if (d.type === 'skill') {
    pivotSkills.add(d.id);
  } else {
    links.forEach(l => {
      const sid = l.source.id, tid = l.target.id;
      if (sid === d.id && tid.startsWith('skill_')) pivotSkills.add(tid);
      if (tid === d.id && sid.startsWith('skill_')) pivotSkills.add(sid);
    });
  }
  pivotSkills.forEach(id => ids.add(id));

  // 2단계: 각 스킬에서 뻗어나간 모든 노드 추가
  links.forEach(l => {
    const sid = l.source.id, tid = l.target.id;
    if (pivotSkills.has(sid)) ids.add(tid);
    if (pivotSkills.has(tid)) ids.add(sid);
  });

  return ids;
}

function highlightNode(d, nodes, links) {
  if (highlightedNodeId === d.id) {
    highlightedNodeId = null;
    nodeG.selectAll('.node').classed('dimmed', false);
    linkG.selectAll('.link').attr('stroke-opacity', 0.05);
    clearInfoPanel();
    return;
  }
  highlightedNodeId = d.id;
  const connectedIds = getConnectedIds(d, links);

  nodeG.selectAll('.node').classed('dimmed', nd => !connectedIds.has(nd.id));
  linkG.selectAll('.link').attr('stroke-opacity', l => {
    const connected = connectedIds.has(l.source.id) && connectedIds.has(l.target.id);
    return connected ? 0.9 : 0.02;
  });

  updateInfoPanel(d, connectedIds, nodes);
}

svg.on('click', () => {
  if (highlightedNodeId) {
    highlightedNodeId = null;
    nodeG.selectAll('.node').classed('dimmed', false);
    linkG.selectAll('.link').attr('stroke-opacity', 0.05);
    clearInfoPanel();
  }
});

// ── 요약 패널 ──────────────────────────────────────────
function clearInfoPanel() {
  document.getElementById('info-panel').classList.remove('visible');
  document.getElementById('info-content').innerHTML = '';
}

function row(label, val) {
  return \`<div class="info-row"><span class="info-label">\${label}</span><span class="info-val">\${val}</span></div>\`;
}
function tags(arr, color) {
  if (!arr || !arr.length) return '';
  const items = arr.map(t => \`<span class="info-tag" style="border-color:\${color}44">\${t}</span>\`).join('');
  return \`<div class="info-tags">\${items}</div>\`;
}

function updateInfoPanel(d, connectedIds, nodes) {
  const panel = document.getElementById('info-panel');
  const content = document.getElementById('info-content');
  panel.classList.add('visible');

  const nodeById = new Map(nodes.map(n => [n.id, n]));
  // 연결된 스킬 목록
  const connSkills = nodes.filter(n => n.type === 'skill' && connectedIds.has(n.id));
  // 연결된 에이전트 목록
  const connAgents = nodes.filter(n => n.type === 'agent' && connectedIds.has(n.id));
  // 연결된 속성 노드들
  const connAttrs  = nodes.filter(n => n.type === 'attr'  && connectedIds.has(n.id));

  let html = '';
  const attrTypeLabel = { damage:'피해유형', effects:'부가효과', reactions:'리액션', synergies:'시너지' };
  const attrTypeColor = { damage:'#ff7b7b', effects:'#1a7f37', reactions:'#7ee787', synergies:'#56d364' };

  if (d.type === 'agent') {
    const a = d.data;
    const elemCol = elementColor[a.element] || '#888';
    const majorCount = {};
    connSkills.forEach(s => { majorCount[s.data.major] = (majorCount[s.data.major]||0)+1; });
    const majorSummary = Object.entries(majorCount).map(([k,v])=>\`\${k}×\${v}\`).join(' · ');

    // 연결 속성 그룹핑
    const byType = {};
    connAttrs.forEach(n => {
      if (!byType[n.attrType]) byType[n.attrType] = [];
      byType[n.attrType].push(n.label);
    });

    html += \`<div class="info-badge" style="background:\${elemCol}22;color:\${elemCol}">에이전트</div>\`;
    html += \`<div class="info-name">\${d.label}</div>\`;
    html += \`<hr class="info-divider">\`;
    html += row('속성', \`<span style="color:\${elemCol}">\${a.element}</span>\`);
    html += row('클래스', a.cls);
    html += row('진영', a.faction);
    html += row('버전', a.rawVersion);
    html += row('스킬 수', connSkills.length + '개');
    if (majorSummary) html += row('스킬 분류', majorSummary);
    html += \`<hr class="info-divider">\`;
    ['effects','damage','synergies','reactions'].forEach(t => {
      if (byType[t] && byType[t].length) {
        html += \`<div class="info-label" style="margin-top:3px">\${attrTypeLabel[t]} (\${byType[t].length})</div>\`;
        html += tags(byType[t].slice(0,8), attrTypeColor[t]);
        if (byType[t].length > 8) html += \`<div style="font-size:10px;color:#8b949e">+\${byType[t].length-8}개 더</div>\`;
      }
    });

  } else if (d.type === 'skill') {
    const s = d.data;
    const agentNode = connAgents[0];
    const elemCol = agentNode ? elementColor[agentNode.data.element] || '#888' : '#888';
    const majCol = majorColor[s.major] || '#888';

    html += \`<div class="info-badge" style="background:\${majCol}22;color:\${majCol}">스킬</div>\`;
    html += \`<div class="info-name">\${d.label}</div>\`;
    html += \`<hr class="info-divider">\`;
    html += row('에이전트', \`<span style="color:\${elemCol}">\${s.agent}</span>\`);
    html += row('대분류', s.major);
    html += row('소분류', s.minor);
    if (s.resource) html += row('소모 자원', s.resource);
    if (s.buff) html += row('전용 버프', s.buff);
    html += \`<hr class="info-divider">\`;
    if (s.damage.length) { html += \`<div class="info-label">피해 유형</div>\`; html += tags(s.damage, '#ff7b7b'); }
    if (s.effects.length) { html += \`<div class="info-label" style="margin-top:3px">부가 효과</div>\`; html += tags(s.effects, '#ffa657'); }
    if (s.reactions.length) { html += \`<div class="info-label" style="margin-top:3px">리액션 태그</div>\`; html += tags(s.reactions, '#56d364'); }
    if (s.synergies.length) { html += \`<div class="info-label" style="margin-top:3px">시너지</div>\`; html += tags(s.synergies, '#bc8cff'); }

  } else if (d.type === 'attr') {
    const typeLabel = attrTypeLabel[d.attrType] || d.attrType;
    const typeCol   = attrTypeColor[d.attrType] || '#888';

    // 연결 에이전트별 스킬 수
    const agentSkillCount = {};
    connSkills.forEach(sn => {
      const a = sn.data.agent;
      agentSkillCount[a] = (agentSkillCount[a]||0)+1;
    });
    const sortedAgents = Object.entries(agentSkillCount).sort((a,b)=>b[1]-a[1]);

    html += \`<div class="info-badge" style="background:\${typeCol}22;color:\${typeCol}">\${typeLabel}</div>\`;
    html += \`<div class="info-name">\${d.label}</div>\`;
    html += \`<hr class="info-divider">\`;
    html += row('연결 스킬 수', connSkills.length + '개');
    html += row('보유 에이전트', connAgents.length + '명');
    html += \`<hr class="info-divider">\`;
    html += \`<div class="info-label">보유 에이전트 (스킬 수 기준)</div>\`;
    const agentTagsHtml = sortedAgents.slice(0,10).map(([name, cnt]) => {
      const agent = connAgents.find(a => a.label === name);
      const col = agent ? elementColor[agent.data.element]||'#888' : '#888';
      return \`<span class="info-tag" style="border-color:\${col}66;color:\${col}">\${name} \${cnt}</span>\`;
    }).join('');
    html += \`<div class="info-tags">\${agentTagsHtml}</div>\`;
    if (sortedAgents.length > 10) html += \`<div style="font-size:10px;color:#8b949e">+\${sortedAgents.length-10}명 더</div>\`;
  }

  content.innerHTML = html;
}

function dragStarted(event, d) {
  if (!event.active) simulation.alphaTarget(0.3).restart();
  d.fx = d.x; d.fy = d.y;
}
function dragged(event, d) { d.fx = event.x; d.fy = event.y; }
function dragEnded(event, d) {
  if (!event.active) simulation.alphaTarget(0);
  d.fx = null; d.fy = null;
}

// 초기 info 표시
document.getElementById('ver-selected-info').textContent = '전체 ' + VERSIONS.length + '개 버전';

// Initial render
rebuildGraph();
</script>
</body>
</html>`;

fs.writeFileSync('D:/Claude/ZZZ_SNA/index.html', html, 'utf-8');
console.log('index.html 생성 완료!');
console.log('파일 크기:', Math.round(fs.statSync('D:/Claude/ZZZ_SNA/index.html').size / 1024) + 'KB');
