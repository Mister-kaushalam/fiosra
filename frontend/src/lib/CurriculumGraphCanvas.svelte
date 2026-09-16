<script>
  import { onMount, onDestroy } from 'svelte';
  import {
    forceSimulation,
    forceManyBody,
    forceLink,
    forceCenter,
    forceCollide
  } from 'd3-force';

  let { graph = { nodes: [], edges: [], probes: [] }, selectedConceptId = '', onSelect = () => {} } = $props();

  let canvasRef = $state(null);
  let containerRef = $state(null);

  // Obsidian graph settings & state
  let scale = $state(1.0);
  let panX = $state(0);
  let panY = $state(0);
  let isPanning = $state(false);
  let startPan = { x: 0, y: 0 };

  // Filter toggles
  let showKCs = $state(true);
  let showMisconceptions = $state(true);
  let showProbes = $state(true);
  let showModules = $state(true);
  let searchQuery = $state('');
  let hudOpen = $state(true);

  // Physics params
  let repulsion = $state(-280);
  let linkDistance = $state(85);
  let centerGravity = $state(0.08);

  // Hover & selection state
  let hoveredNode = $state(null);
  let mousePos = $state({ x: 0, y: 0 });
  let draggedNode = null;

  // Simulation & animation refs
  let simulation = null;
  let animFrameId = null;
  let simNodes = $state([]);
  let simLinks = $state([]);

  const COLOR_MAP = {
    course_theme: '#10b981',
    module: '#10b981',
    pedagogical_kc: '#38bdf8',
    atomic_concept: '#38bdf8',
    topic: '#0284c7',
    subtopic: '#06b6d4',
    misconception: '#f59e0b',
    socratic_probe: '#c084fc',
    default: '#94a3b8'
  };

  const GLOW_MAP = {
    module: 'rgba(16, 185, 129, 0.55)',
    pedagogical_kc: 'rgba(56, 189, 248, 0.55)',
    atomic_concept: 'rgba(56, 189, 248, 0.55)',
    topic: 'rgba(2, 132, 199, 0.55)',
    subtopic: 'rgba(6, 182, 212, 0.55)',
    misconception: 'rgba(245, 158, 11, 0.75)',
    socratic_probe: 'rgba(192, 132, 252, 0.65)',
    default: 'rgba(148, 163, 184, 0.3)'
  };

  function getNodeColor(node) {
    return COLOR_MAP[node.level] || COLOR_MAP[node.concept_type] || COLOR_MAP.default;
  }

  function getNodeGlow(node) {
    return GLOW_MAP[node.level] || GLOW_MAP[node.concept_type] || GLOW_MAP.default;
  }

  function getNodeRadius(node) {
    const deg = node.degree || 1;
    if (node.level === 'module' || node.concept_type === 'module') {
      return Math.min(22, 14 + deg * 1.5);
    }
    if (node.level === 'misconception' || node.concept_type === 'misconception') {
      return Math.min(15, 8 + deg * 1.2);
    }
    if (node.level === 'socratic_probe' || node.concept_type === 'socratic_probe') {
      return Math.min(10, 5 + deg * 0.8);
    }
    return Math.min(16, 8 + deg * 1.2);
  }

  function filterNode(node) {
    const type = node.concept_type || node.level;
    if (type === 'module' && !showModules) return false;
    if (type === 'misconception' && !showMisconceptions) return false;
    if (type === 'socratic_probe' && !showProbes) return false;
    if ((type === 'pedagogical_kc' || type === 'atomic_concept' || type === 'topic' || type === 'subtopic') && !showKCs) return false;
    return true;
  }

  function getNeighborIds(nodeId) {
    const set = new Set([nodeId]);
    for (const link of simLinks) {
      const sId = typeof link.source === 'object' ? link.source.id : link.source;
      const tId = typeof link.target === 'object' ? link.target.id : link.target;
      if (sId === nodeId) set.add(tId);
      if (tId === nodeId) set.add(sId);
    }
    return set;
  }

  function rebuildSimulation() {
    if (!canvasRef || !containerRef) return;
    const width = containerRef.clientWidth || 900;
    const height = containerRef.clientHeight || 650;

    const rawNodes = graph?.nodes || [];
    const rawEdges = graph?.edges || [];

    // Filter nodes according to toggle buttons
    const activeNodes = rawNodes.filter(filterNode);
    const activeNodeIds = new Set(activeNodes.map(n => n.concept_id));

    // Filter edges whose endpoints are both visible
    const activeEdges = rawEdges.filter(e => activeNodeIds.has(e.source) && activeNodeIds.has(e.target));

    // Reuse existing positions if node was already in simulation to avoid jarring jumps
    const existingPos = new Map(simNodes.map(n => [n.id, { x: n.x, y: n.y, vx: n.vx, vy: n.vy }]));

    simNodes = activeNodes.map(node => {
      const prev = existingPos.get(node.concept_id);
      const radius = getNodeRadius(node);
      return {
        id: node.concept_id,
        raw: node,
        radius,
        color: getNodeColor(node),
        glow: getNodeGlow(node),
        x: prev ? prev.x : width / 2 + (Math.random() - 0.5) * 200,
        y: prev ? prev.y : height / 2 + (Math.random() - 0.5) * 200,
        vx: prev ? prev.vx : 0,
        vy: prev ? prev.vy : 0
      };
    });

    simLinks = activeEdges.map(edge => ({
      source: edge.source,
      target: edge.target,
      relation: edge.relation
    }));

    if (simulation) {
      simulation.stop();
    }

    simulation = forceSimulation(simNodes)
      .force('charge', forceManyBody().strength(repulsion))
      .force('link', forceLink(simLinks).id(d => d.id).distance(linkDistance))
      .force('center', forceCenter(width / 2, height / 2).strength(centerGravity))
      .force('collision', forceCollide().radius(d => d.radius + 8))
      .alpha(0.6)
      .restart();
  }

  function render() {
    if (!canvasRef) return;
    const ctx = canvasRef.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    // Physical pixel dimensions
    const pw = canvasRef.width;
    const ph = canvasRef.height;
    // Logical (CSS) dimensions
    const width = pw / dpr;
    const height = ph / dpr;

    // Reset transform to identity before clearing so we always wipe the whole canvas
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, pw, ph);

    ctx.save();
    // Re-apply DPR scaling for crisp rendering
    ctx.scale(dpr, dpr);

    // 1. Cosmic background & subtle radial vignette
    const bgGrad = ctx.createRadialGradient(width / 2, height / 2, 50, width / 2, height / 2, Math.max(width, height) * 0.7);
    bgGrad.addColorStop(0, '#0e1420');
    bgGrad.addColorStop(0.65, '#090d14');
    bgGrad.addColorStop(1, '#06080d');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Subtle cosmic grid dots — drawn in screen-space accounting for pan+scale
    // so they stay fixed in world-space and don't streak during pan/zoom
    ctx.fillStyle = 'rgba(255, 255, 255, 0.035)';
    const gridSize = 42 * scale;
    const gridOffX = ((panX % gridSize) + gridSize) % gridSize;
    const gridOffY = ((panY % gridSize) + gridSize) % gridSize;
    for (let gx = gridOffX; gx < width; gx += gridSize) {
      for (let gy = gridOffY; gy < height; gy += gridSize) {
        ctx.fillRect(gx, gy, 1.2, 1.2);
      }
    }

    // Apply viewport transform (pan & zoom)
    ctx.translate(panX, panY);
    ctx.scale(scale, scale);

    // Calculate neighborhood for spotlight effect if hovering a node
    const spotlightIds = hoveredNode ? getNeighborIds(hoveredNode.id) : null;
    const searchLower = searchQuery.trim().toLowerCase();

    // 2. Draw Links
    for (const link of simLinks) {
      const source = typeof link.source === 'object' ? link.source : simNodes.find(n => n.id === link.source);
      const target = typeof link.target === 'object' ? link.target : simNodes.find(n => n.id === link.target);
      if (!source || !target) continue;

      const isConnectedToHover = hoveredNode && (source.id === hoveredNode.id || target.id === hoveredNode.id);
      const isConnectedToSelected = selectedConceptId && (source.id === selectedConceptId || target.id === selectedConceptId);

      let alpha = 0.22;
      let strokeColor = '#64748b';
      let lineWidth = 1.0;

      if (link.relation === 'ASSOCIATED_WITH') {
        strokeColor = '#f59e0b';
        alpha = 0.35;
      } else if (link.relation === 'PROBED_BY') {
        strokeColor = '#c084fc';
        alpha = 0.35;
      } else if (link.relation === 'REQUIRES' || link.relation === 'PREREQUISITE_OF') {
        strokeColor = '#ec4899';
        alpha = 0.35;
      } else if (link.relation === 'CONTAINS' || link.relation === 'DEVELOPS') {
        strokeColor = '#38bdf8';
        alpha = 0.28;
      }

      if (hoveredNode) {
        if (isConnectedToHover) {
          alpha = 0.95;
          lineWidth = 2.2;
        } else {
          alpha = 0.04;
        }
      } else if (isConnectedToSelected) {
        alpha = 0.85;
        lineWidth = 2.0;
      }

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(source.x, source.y);
      ctx.lineTo(target.x, target.y);

      ctx.globalAlpha = alpha;
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = lineWidth;

      if (link.relation === 'ASSOCIATED_WITH') {
        ctx.setLineDash([4, 4]);
      } else if (link.relation === 'REQUIRES') {
        ctx.setLineDash([6, 4]);
      } else {
        ctx.setLineDash([]);
      }

      if (isConnectedToHover || isConnectedToSelected) {
        ctx.shadowColor = strokeColor;
        ctx.shadowBlur = 8;
      }

      ctx.stroke();
      ctx.restore();
    }

    // 3. Draw Nodes (Cosmic Spheres)
    for (const node of simNodes) {
      const isSelected = node.id === selectedConceptId;
      const isHovered = hoveredNode && node.id === hoveredNode.id;
      const isNeighbor = spotlightIds ? spotlightIds.has(node.id) : false;
      const matchesSearch = searchLower && node.raw.label?.toLowerCase().includes(searchLower);

      let alpha = 1.0;
      if (hoveredNode) {
        alpha = isHovered || isNeighbor ? 1.0 : 0.12;
      } else if (searchLower && !matchesSearch) {
        alpha = 0.2;
      }

      ctx.save();
      ctx.globalAlpha = alpha;

      // Outer radial glow halo
      const glowRadius = node.radius * (isSelected || isHovered ? 2.8 : 1.8);
      const glowGrad = ctx.createRadialGradient(node.x, node.y, node.radius * 0.4, node.x, node.y, glowRadius);
      glowGrad.addColorStop(0, node.glow);
      glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(node.x, node.y, glowRadius, 0, Math.PI * 2);
      ctx.fill();

      // Core sphere with multi-stage gradient
      const sphereGrad = ctx.createRadialGradient(
        node.x - node.radius * 0.3,
        node.y - node.radius * 0.3,
        node.radius * 0.1,
        node.x,
        node.y,
        node.radius
      );
      sphereGrad.addColorStop(0, '#ffffff');
      sphereGrad.addColorStop(0.35, node.color);
      sphereGrad.addColorStop(1, '#0f172a');

      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
      ctx.fillStyle = sphereGrad;
      ctx.shadowColor = node.color;
      ctx.shadowBlur = isSelected || isHovered ? 18 : 6;
      ctx.fill();

      // Distinct outer border for Misconception warning traps
      if (node.raw.level === 'misconception' || node.raw.concept_type === 'misconception') {
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius + 3, 0, Math.PI * 2);
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1.4;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
      }

      // Selection ring
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius + 5, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.2;
        ctx.setLineDash([]);
        ctx.shadowColor = '#38bdf8';
        ctx.shadowBlur = 12;
        ctx.stroke();
      }

      // Search match highlight ring
      if (matchesSearch) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius + 7, 0, Math.PI * 2);
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Node Label — only show when zoomed in enough, selected, hovered,
      // search-matched, or for large hub nodes. This prevents label clutter
      // at low zoom levels.
      const degreeThreshold = node.raw.degree >= 4;
      const showLabel = isSelected || isHovered || matchesSearch
        || (scale > 1.1 && degreeThreshold)
        || (scale > 1.6);
      if (showLabel) {
        const fontSize = Math.max(9, Math.min(12, 10 / scale + 1));
        ctx.font = `${node.radius > 12 ? '600' : '500'} ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        const text = node.raw.label || node.id;
        // Truncate long labels
        const maxChars = Math.floor(28 / Math.max(0.5, scale));
        const displayText = text.length > maxChars ? text.slice(0, maxChars) + '…' : text;
        const textWidth = ctx.measureText(displayText).width;
        const textY = node.y + node.radius + 13;

        // Label background badge
        ctx.fillStyle = 'rgba(6, 8, 13, 0.88)';
        ctx.beginPath();
        ctx.roundRect(node.x - textWidth / 2 - 5, textY - 10, textWidth + 10, 15, 4);
        ctx.fill();

        ctx.fillStyle = isSelected ? '#ffffff' : (isHovered ? '#38bdf8' : '#cbd5e1');
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(displayText, node.x, textY + 1);
      }

      ctx.restore();
    }

    ctx.restore();

    animFrameId = requestAnimationFrame(render);
  }

  function screenToWorld(clientX, clientY) {
    if (!canvasRef) return { x: 0, y: 0 };
    const rect = canvasRef.getBoundingClientRect();
    const x = (clientX - rect.left - panX) / scale;
    const y = (clientY - rect.top - panY) / scale;
    return { x, y };
  }

  function findNodeAt(worldX, worldY) {
    for (let i = simNodes.length - 1; i >= 0; i--) {
      const node = simNodes[i];
      const dx = worldX - node.x;
      const dy = worldY - node.y;
      if (dx * dx + dy * dy <= (node.radius + 6) * (node.radius + 6)) {
        return node;
      }
    }
    return null;
  }

  function handlePointerDown(e) {
    const world = screenToWorld(e.clientX, e.clientY);
    const hit = findNodeAt(world.x, world.y);

    if (hit) {
      draggedNode = hit;
      draggedNode.fx = hit.x;
      draggedNode.fy = hit.y;
      if (simulation) simulation.alphaTarget(0.3).restart();
    } else {
      isPanning = true;
      startPan = { x: e.clientX - panX, y: e.clientY - panY };
    }
  }

  function handlePointerMove(e) {
    mousePos = { x: e.clientX, y: e.clientY };
    const world = screenToWorld(e.clientX, e.clientY);

    if (draggedNode) {
      draggedNode.fx = world.x;
      draggedNode.fy = world.y;
    } else if (isPanning) {
      panX = e.clientX - startPan.x;
      panY = e.clientY - startPan.y;
    } else {
      hoveredNode = findNodeAt(world.x, world.y);
    }
  }

  function handlePointerUp(e) {
    if (draggedNode) {
      const world = screenToWorld(e.clientX, e.clientY);
      const dist = Math.hypot(world.x - draggedNode.x, world.y - draggedNode.y);
      if (dist < 4) {
        onSelect(draggedNode.id);
      }
      draggedNode.fx = null;
      draggedNode.fy = null;
      draggedNode = null;
      if (simulation) simulation.alphaTarget(0);
    }
    isPanning = false;
  }

  function handleWheel(e) {
    e.preventDefault();
    if (!canvasRef) return;
    const rect = canvasRef.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.12 : 0.89;
    const newScale = Math.max(0.25, Math.min(3.8, scale * zoomFactor));

    // Zoom towards mouse pointer
    panX = mouseX - (mouseX - panX) * (newScale / scale);
    panY = mouseY - (mouseY - panY) * (newScale / scale);
    scale = newScale;
  }

  function recenterGraph() {
    if (!containerRef || simNodes.length === 0) {
      scale = 1.0;
      panX = 0;
      panY = 0;
      return;
    }
    const W = containerRef.clientWidth;
    const H = containerRef.clientHeight;

    // Compute bounding box of all simulation nodes
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of simNodes) {
      if (n.x == null || n.y == null) continue;
      const r = n.radius + 24; // margin
      minX = Math.min(minX, n.x - r);
      maxX = Math.max(maxX, n.x + r);
      minY = Math.min(minY, n.y - r);
      maxY = Math.max(maxY, n.y + r);
    }

    if (!isFinite(minX)) {
      scale = 1.0;
      panX = 0;
      panY = 0;
      if (simulation) simulation.alpha(0.5).restart();
      return;
    }

    const bw = maxX - minX;
    const bh = maxY - minY;
    const newScale = Math.max(0.25, Math.min(2.0, Math.min(W / bw, H / bh) * 0.88));
    scale = newScale;
    panX = (W - bw * newScale) / 2 - minX * newScale;
    panY = (H - bh * newScale) / 2 - minY * newScale;

    if (simulation) {
      simulation.alpha(0.5).restart();
    }
  }

  function updatePhysics() {
    if (!simulation) return;
    simulation.force('charge', forceManyBody().strength(repulsion));
    simulation.force('link', forceLink(simLinks).id(d => d.id).distance(linkDistance));
    simulation.force('center', forceCenter(containerRef.clientWidth / 2, containerRef.clientHeight / 2).strength(centerGravity));
    simulation.alpha(0.4).restart();
  }

  $effect(() => {
    // Re-run simulation when graph structure or filter toggles change
    graph;
    showKCs;
    showMisconceptions;
    showProbes;
    showModules;
    rebuildSimulation();
  });

  $effect(() => {
    // Update physics forces when sliders move
    repulsion;
    linkDistance;
    centerGravity;
    updatePhysics();
  });

  onMount(() => {
    const updateSize = () => {
      if (!canvasRef || !containerRef) return;
      const dpr = window.devicePixelRatio || 1;
      const w = containerRef.clientWidth || 900;
      const h = containerRef.clientHeight || 650;
      canvasRef.width = w * dpr;
      canvasRef.height = h * dpr;
      recenterGraph();
      rebuildSimulation();
    };

    window.addEventListener('resize', updateSize);
    updateSize();
    animFrameId = requestAnimationFrame(render);

    return () => {
      window.removeEventListener('resize', updateSize);
      if (animFrameId) cancelAnimationFrame(animFrameId);
      if (simulation) simulation.stop();
    };
  });

  onDestroy(() => {
    if (animFrameId) cancelAnimationFrame(animFrameId);
    if (simulation) simulation.stop();
  });
</script>

<div class="obsidian-graph-shell" bind:this={containerRef}>
  <canvas
    bind:this={canvasRef}
    class="obsidian-canvas"
    onpointerdown={handlePointerDown}
    onpointermove={handlePointerMove}
    onpointerup={handlePointerUp}
    onwheel={handleWheel}
  ></canvas>

  <!-- Obsidian Floating Controls HUD -->
  <div class="obsidian-hud" class:collapsed={!hudOpen}>
    <header class="hud-header">
      <div class="hud-title">
        <span class="hud-icon">✦</span>
        <span>Graph Controls</span>
      </div>
      <button type="button" class="hud-toggle-btn" onclick={() => hudOpen = !hudOpen} aria-label="Toggle Controls">
        {hudOpen ? '−' : '+'}
      </button>
    </header>

    {#if hudOpen}
      <div class="hud-body">
        <!-- Search bar -->
        <div class="hud-section">
          <label for="graph-search">Search Nodes</label>
          <input
            id="graph-search"
            type="text"
            placeholder="Filter by concept title..."
            bind:value={searchQuery}
          />
        </div>

        <!-- Node Group Toggles -->
        <div class="hud-section">
          <span class="section-label">Node Groups</span>
          <div class="toggle-group">
            <label class="checkbox-pill kc">
              <input type="checkbox" bind:checked={showKCs} />
              <span class="dot kc-dot"></span>
              Knowledge Components
            </label>
            <label class="checkbox-pill misc">
              <input type="checkbox" bind:checked={showMisconceptions} />
              <span class="dot misc-dot"></span>
              Misconception Traps
            </label>
            <label class="checkbox-pill probe">
              <input type="checkbox" bind:checked={showProbes} />
              <span class="dot probe-dot"></span>
              Socratic Probes
            </label>
            <label class="checkbox-pill module">
              <input type="checkbox" bind:checked={showModules} />
              <span class="dot module-dot"></span>
              Course Modules
            </label>
          </div>
        </div>

        <!-- Forces Sliders (Obsidian Graph standard) -->
        <div class="hud-section">
          <span class="section-label">Forces</span>
          <div class="slider-row">
            <span>Repulsion</span>
            <input type="range" min="-600" max="-80" step="20" bind:value={repulsion} />
          </div>
          <div class="slider-row">
            <span>Link Distance</span>
            <input type="range" min="40" max="220" step="10" bind:value={linkDistance} />
          </div>
          <div class="slider-row">
            <span>Center Gravity</span>
            <input type="range" min="0.01" max="0.25" step="0.01" bind:value={centerGravity} />
          </div>
        </div>

        <!-- Quick Actions -->
        <div class="hud-actions">
          <button type="button" class="btn-hud" onclick={recenterGraph}>
            ⟲ Recenter & Fit
          </button>
          <button type="button" class="btn-hud" onclick={() => { if (simulation) simulation.alpha(0.6).restart(); }}>
            ⚡ Reheat Physics
          </button>
        </div>
      </div>
    {/if}
  </div>

  <!-- Zoom & Scale pill in bottom left -->
  <div class="zoom-badge">
    <span>Zoom: {Math.round(scale * 100)}%</span>
    <span>{simNodes.length} Nodes · {simLinks.length} Links</span>
  </div>

  <!-- Interactive Node Hover Tooltip -->
  {#if hoveredNode}
    <div
      class="node-tooltip"
      style="left: {mousePos.x + 14}px; top: {mousePos.y - 12}px;"
    >
      <div class="tooltip-header">
        <span class="tooltip-tag" style="background: {hoveredNode.glow}; color: {hoveredNode.color};">
          {hoveredNode.raw.concept_type || hoveredNode.raw.level}
        </span>
        {#if hoveredNode.raw.degree}
          <span class="tooltip-degree">{hoveredNode.raw.degree} connections</span>
        {/if}
      </div>
      <strong class="tooltip-title">{hoveredNode.raw.label}</strong>
      {#if hoveredNode.raw.definition}
        <p class="tooltip-def">{hoveredNode.raw.definition}</p>
      {/if}
      <span class="tooltip-hint">Click to inspect in drawer</span>
    </div>
  {/if}
</div>

<style>
  .obsidian-graph-shell {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 650px;
    background: #06080d;
    overflow: hidden;
    user-select: none;
  }

  .obsidian-canvas {
    display: block;
    width: 100%;
    height: 100%;
    cursor: grab;
  }
  .obsidian-canvas:active {
    cursor: grabbing;
  }

  /* Floating Frosted Glass HUD (Obsidian Graph style) */
  .obsidian-hud {
    position: absolute;
    top: 14px;
    right: 14px;
    width: 250px;
    background: rgba(13, 17, 25, 0.84);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 10px;
    box-shadow: 0 12px 34px rgba(0, 0, 0, 0.65);
    color: #e2e8f0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 11px;
    z-index: 20;
    transition: width 0.2s ease, opacity 0.2s ease;
  }
  .obsidian-hud.collapsed {
    width: auto;
  }

  .hud-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 9px 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }
  .hud-title {
    display: flex;
    align-items: center;
    gap: 7px;
    font-weight: 600;
    letter-spacing: 0.3px;
  }
  .hud-icon {
    color: #38bdf8;
    font-size: 12px;
  }
  .hud-toggle-btn {
    background: transparent;
    border: none;
    color: #94a3b8;
    cursor: pointer;
    font-size: 14px;
    padding: 0 4px;
  }
  .hud-toggle-btn:hover {
    color: #ffffff;
  }

  .hud-body {
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .hud-section {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .section-label,
  .hud-section label {
    font-size: 9.5px;
    font-weight: 700;
    letter-spacing: 0.4px;
    text-transform: uppercase;
    color: #94a3b8;
  }
  .hud-section input[type="text"] {
    background: rgba(15, 23, 42, 0.85);
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 5px;
    color: #f8fafc;
    font-size: 11px;
    padding: 6px 8px;
    outline: none;
    transition: border-color 0.15s ease;
  }
  .hud-section input[type="text"]:focus {
    border-color: #38bdf8;
  }

  .toggle-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .checkbox-pill {
    display: flex;
    align-items: center;
    gap: 7px;
    cursor: pointer;
    font-size: 11px;
    color: #cbd5e1;
    padding: 3px 0;
  }
  .checkbox-pill:hover {
    color: #ffffff;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    display: inline-block;
  }
  .kc-dot { background: #38bdf8; box-shadow: 0 0 6px #38bdf8; }
  .misc-dot { background: #f59e0b; box-shadow: 0 0 6px #f59e0b; }
  .probe-dot { background: #c084fc; box-shadow: 0 0 6px #c084fc; }
  .module-dot { background: #10b981; box-shadow: 0 0 6px #10b981; }

  .slider-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: 10px;
    color: #94a3b8;
  }
  .slider-row input[type="range"] {
    width: 120px;
    accent-color: #38bdf8;
    cursor: pointer;
  }

  .hud-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    margin-top: 4px;
  }
  .btn-hud {
    background: rgba(30, 41, 59, 0.7);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 4px;
    color: #f1f5f9;
    cursor: pointer;
    font-size: 10px;
    padding: 5px 8px;
    text-align: center;
    transition: all 0.15s ease;
  }
  .btn-hud:hover {
    background: rgba(56, 189, 248, 0.2);
    border-color: #38bdf8;
  }

  .zoom-badge {
    position: absolute;
    bottom: 14px;
    left: 14px;
    background: rgba(15, 23, 42, 0.75);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 6px;
    color: #94a3b8;
    display: flex;
    gap: 12px;
    font-family: monospace;
    font-size: 10.5px;
    padding: 5px 10px;
    pointer-events: none;
  }

  /* Node Hover Tooltip */
  .node-tooltip {
    position: fixed;
    pointer-events: none;
    background: rgba(10, 14, 23, 0.94);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 8px;
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.75);
    color: #f8fafc;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    max-width: 260px;
    padding: 10px 12px;
    z-index: 50;
    transition: opacity 0.1s ease;
  }
  .tooltip-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 5px;
  }
  .tooltip-tag {
    border-radius: 4px;
    font-size: 8.5px;
    font-weight: 700;
    letter-spacing: 0.3px;
    padding: 2px 6px;
    text-transform: uppercase;
  }
  .tooltip-degree {
    color: #94a3b8;
    font-size: 9px;
  }
  .tooltip-title {
    display: block;
    font-size: 12.5px;
    line-height: 1.35;
    color: #ffffff;
    margin-bottom: 4px;
  }
  .tooltip-def {
    font-size: 10.5px;
    line-height: 1.4;
    color: #cbd5e1;
    margin: 0 0 6px 0;
  }
  .tooltip-hint {
    color: #38bdf8;
    font-size: 9px;
    font-style: italic;
  }
</style>
