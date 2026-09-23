<script>
  import { onMount, onDestroy } from 'svelte';
  import {
    forceSimulation,
    forceManyBody,
    forceLink,
    forceCenter,
    forceCollide
  } from 'd3-force';

  let {
    graph = { nodes: [], edges: [], probes: [] },
    selectedConceptId = '',
    onSelect = () => {},
    theme = $bindable('light')
  } = $props();

  let canvasRef = $state(null);
  let containerRef = $state(null);

  // Viewport Pan & Zoom
  let scale = $state(1.0);
  let panX = $state(0);
  let panY = $state(0);
  let isPanning = $state(false);
  let startPan = { x: 0, y: 0 };
  let startClient = { x: 0, y: 0 };

  // Filter toggles
  let showKCs = $state(true);
  let showMisconceptions = $state(true);
  let showProbes = $state(true);
  let showModules = $state(true);
  // Focus mode: collapse the canvas to the selected node's neighbourhood.
  // On a course-sized graph a single concept is invisible among thousands, so
  // this is how one concept and its traps can actually be shown.
  let focusMode = $state(false);
  let focusDepth = $state(1);
  let searchQuery = $state('');
  let hudOpen = $state(true);
  let activeTab = $state('filters'); // 'filters' | 'display' | 'forces'

  // Display toggles & sliders (matching Obsidian Graph settings)
  let nodeSizeMultiplier = $state(1.1);
  let linkThickness = $state(1.0);
  let textSize = $state(10);
  let showArrows = $state(true);
  let showAllLabels = $state(false);

  // Physics params
  let repulsion = $state(-260);
  let linkDistance = $state(80);
  let centerGravity = $state(0.08);

  // Hover & selection state
  let hoveredNode = $state(null);
  let mousePos = $state({ x: 0, y: 0 });
  let draggedNode = null;

  // Simulation & animation refs
  let simulation = null;
  let animFrameId = null;
  let isDestroyed = false;
  let simNodes = [];
  let simLinks = [];
  let nodeCount = $state(0);
  let linkCount = $state(0);

  // Authentic Obsidian Color Palettes (Light matching screenshot, Dark as classic Obsidian)
  const PALETTES = {
    light: {
      bg: '#ffffff',
      gridDot: 'rgba(0, 0, 0, 0.04)',
      link: 'rgba(0, 0, 0, 0.16)',
      linkHighlight: '#222222',
      linkFade: 'rgba(0, 0, 0, 0.03)',
      text: '#4a4a4a',
      textHighlight: '#0a0a0a',
      textHalo: 'rgba(255, 255, 255, 0.92)',
      selectRing: '#2563eb',
      hoverRing: 'rgba(0, 0, 0, 0.35)',
      // Node colors matching the user's Obsidian graph screenshot
      module: '#242424',            // Major Course Modules / Hubs
      course_theme: '#242424',
      hub_kc: '#444444',            // Prominent Hub Knowledge Components
      pedagogical_kc: '#5c5c5c',    // Standard KCs
      atomic_concept: '#707070',    // Concepts
      topic: '#5c5c5c',
      subtopic: '#787878',
      leaf: '#a3a3a3',              // Small peripheral notes
      misconception: '#e05252',     // Coral Red (matches red nodes in screenshot)
      socratic_probe: '#e59b2c',    // Warm Amber Gold (matches amber nodes in screenshot)
      default: '#707070'
    },
    dark: {
      bg: '#161616',
      gridDot: 'rgba(255, 255, 255, 0.04)',
      link: 'rgba(255, 255, 255, 0.16)',
      linkHighlight: '#f4f4f5',
      linkFade: 'rgba(255, 255, 255, 0.03)',
      text: '#a1a1aa',
      textHighlight: '#ffffff',
      textHalo: 'rgba(22, 22, 22, 0.92)',
      selectRing: '#60a5fa',
      hoverRing: 'rgba(255, 255, 255, 0.55)',
      module: '#f4f4f5',
      course_theme: '#f4f4f5',
      hub_kc: '#d4d4d8',
      pedagogical_kc: '#a1a1aa',
      atomic_concept: '#71717a',
      topic: '#a1a1aa',
      subtopic: '#71717a',
      leaf: '#52525b',
      misconception: '#ef5350',
      socratic_probe: '#d89a3a',
      default: '#a1a1aa'
    }
  };

  function getNodeColor(node, currentTheme) {
    const palette = PALETTES[currentTheme] || PALETTES.light;
    const type = node.concept_type || node.level;
    if (type === 'misconception') return palette.misconception;
    if (type === 'socratic_probe') return palette.socratic_probe;
    if (type === 'module' || type === 'course_theme') return palette.module;
    
    // Scale tone based on connectivity (degree)
    const deg = node.degree || 0;
    if (deg >= 5) return palette.hub_kc;
    if (deg >= 2) return palette.pedagogical_kc;
    return palette.leaf;
  }

  function getNodeRadius(degree, type) {
    const deg = Math.max(0, degree);
    let base = 5.5;
    if (type === 'module' || type === 'course_theme') {
      base = 11;
    } else if (type === 'misconception') {
      base = 7.5;
    } else if (type === 'socratic_probe') {
      base = 6;
    } else {
      base = 6;
    }
    // Organic growth based on degree
    const growth = Math.min(18, Math.sqrt(deg) * 4.2);
    return (base + growth) * nodeSizeMultiplier;
  }

  function filterNode(node) {
    const type = node.concept_type || node.level;
    if (type === 'module' && !showModules) return false;
    if (type === 'misconception' && !showMisconceptions) return false;
    if (type === 'socratic_probe' && !showProbes) return false;
    if (type !== 'module' && type !== 'misconception' && type !== 'socratic_probe' && !showKCs) return false;
    return true;
  }

  // Ids within `depth` hops of `rootId`, walking the raw edges so the result
  // does not depend on what the simulation happens to hold right now.
  function neighbourhoodIds(rootId, edges, depth) {
    const adjacency = new Map();
    const link = (a, b) => {
      if (!adjacency.has(a)) adjacency.set(a, []);
      adjacency.get(a).push(b);
    };
    for (const edge of edges) { link(edge.source, edge.target); link(edge.target, edge.source); }
    const seen = new Set([rootId]);
    let frontier = [rootId];
    for (let hop = 0; hop < depth; hop++) {
      const next = [];
      for (const id of frontier) {
        for (const other of adjacency.get(id) || []) {
          if (!seen.has(other)) { seen.add(other); next.push(other); }
        }
      }
      frontier = next;
      if (!frontier.length) break;
    }
    return seen;
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

  function toggleTheme(newTheme) {
    theme = newTheme;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('obsidian_graph_theme', newTheme);
    }
  }

  function rebuildSimulation() {
    if (!canvasRef || !containerRef) return;
    const width = containerRef.clientWidth || 900;
    const height = containerRef.clientHeight || 650;

    const rawNodes = graph?.nodes || [];
    const rawEdges = graph?.edges || [];

    // Filter nodes according to toggle buttons
    let activeNodes = rawNodes.filter(filterNode);

    // Then, if focusing, keep only the selected node's neighbourhood. Focus
    // with nothing selected would blank the canvas, so it is a no-op until a
    // node is clicked.
    if (focusMode && selectedConceptId) {
      const keep = neighbourhoodIds(selectedConceptId, rawEdges, focusDepth);
      const focused = activeNodes.filter(n => keep.has(n.concept_id));
      if (focused.length) activeNodes = focused;
    }
    const activeNodeIds = new Set(activeNodes.map(n => n.concept_id));

    // Filter edges whose endpoints are both visible
    const activeEdges = rawEdges.filter(e => activeNodeIds.has(e.source) && activeNodeIds.has(e.target));

    // Compute actual node degrees from active edges
    const degreeMap = new Map();
    for (const e of activeEdges) {
      degreeMap.set(e.source, (degreeMap.get(e.source) || 0) + 1);
      degreeMap.set(e.target, (degreeMap.get(e.target) || 0) + 1);
    }

    // Reuse existing positions if node was already in simulation
    const existingPos = new Map(simNodes.map(n => [n.id, { x: n.x, y: n.y, vx: n.vx, vy: n.vy }]));

    simNodes = activeNodes.map(node => {
      const prev = existingPos.get(node.concept_id);
      const degree = degreeMap.get(node.concept_id) || node.degree || 0;
      const type = node.concept_type || node.level;
      const radius = getNodeRadius(degree, type);
      return {
        id: node.concept_id,
        raw: node,
        degree,
        radius,
        color: getNodeColor({ ...node, degree }, theme),
        x: prev ? prev.x : width / 2 + (Math.random() - 0.5) * 240,
        y: prev ? prev.y : height / 2 + (Math.random() - 0.5) * 240,
        vx: prev ? prev.vx : 0,
        vy: prev ? prev.vy : 0
      };
    });

    simLinks = activeEdges.map(edge => ({
      source: edge.source,
      target: edge.target,
      relation: edge.relation
    }));

    nodeCount = simNodes.length;
    linkCount = simLinks.length;

    if (simulation) {
      simulation.stop();
    }

    simulation = forceSimulation(simNodes)
      .force('charge', forceManyBody().strength(repulsion))
      .force('link', forceLink(simLinks).id(d => d.id).distance(linkDistance))
      .force('center', forceCenter(width / 2, height / 2).strength(centerGravity))
      .force('collision', forceCollide().radius(d => d.radius + 6))
      .alpha(0.6)
      .restart();
  }

  function drawArrowhead(ctx, sourceX, sourceY, targetX, targetY, targetRadius, color, alpha) {
    const dx = targetX - sourceX;
    const dy = targetY - sourceY;
    const dist = Math.hypot(dx, dy);
    const arrowLen = Math.max(5, Math.min(8, 6.5 * Math.min(1.2, scale)));
    const arrowWidth = Math.max(4, Math.min(7, 5 * Math.min(1.2, scale)));

    if (dist <= targetRadius + arrowLen) return;

    const ux = dx / dist;
    const uy = dy / dist;

    // The tip of the arrowhead sits right on the outer boundary of the target circle
    const tipX = targetX - ux * (targetRadius + 1);
    const tipY = targetY - uy * (targetRadius + 1);

    const baseX = tipX - ux * arrowLen;
    const baseY = tipY - uy * arrowLen;

    const nx = -uy;
    const ny = ux;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(baseX + nx * (arrowWidth / 2), baseY + ny * (arrowWidth / 2));
    ctx.lineTo(baseX - nx * (arrowWidth / 2), baseY - ny * (arrowWidth / 2));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function render() {
    if (isDestroyed || !canvasRef) return;
    const ctx = canvasRef.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const pw = canvasRef.width;
    const ph = canvasRef.height;
    const width = pw / dpr;
    const height = ph / dpr;

    const palette = PALETTES[theme] || PALETTES.light;

    // Clear canvas
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, pw, ph);

    ctx.save();
    ctx.scale(dpr, dpr);

    // 1. Clean Obsidian Canvas Background (pure white in light mode, pure dark in dark mode)
    ctx.fillStyle = palette.bg;
    ctx.fillRect(0, 0, width, height);

    // Subtle faint micro-grid dots (Obsidian canvas style)
    ctx.fillStyle = palette.gridDot;
    const gridSize = 40 * scale;
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

    // Neighborhood spotlight set
    const spotlightIds = hoveredNode ? getNeighborIds(hoveredNode.id) : null;
    const searchLower = searchQuery.trim().toLowerCase();

    // 2. Draw Links & Arrowheads
    for (const link of simLinks) {
      const source = typeof link.source === 'object' ? link.source : simNodes.find(n => n.id === link.source);
      const target = typeof link.target === 'object' ? link.target : simNodes.find(n => n.id === link.target);
      if (!source || !target) continue;

      const isConnectedToHover = hoveredNode && (source.id === hoveredNode.id || target.id === hoveredNode.id);
      const isConnectedToSelected = selectedConceptId && (source.id === selectedConceptId || target.id === selectedConceptId);

      let alpha = 0.55;
      let strokeColor = palette.link;
      let width = linkThickness;

      if (hoveredNode) {
        if (isConnectedToHover) {
          alpha = 0.95;
          strokeColor = palette.linkHighlight;
          width = linkThickness * 1.8;
        } else {
          alpha = 0.05;
          strokeColor = palette.linkFade;
        }
      } else if (isConnectedToSelected) {
        alpha = 0.92;
        strokeColor = palette.linkHighlight;
        width = linkThickness * 1.6;
      }

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(source.x, source.y);

      // Stop line at arrowhead base if arrows are enabled
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const dist = Math.hypot(dx, dy);
      const targetR = target.radius;
      const arrowLen = Math.max(5, Math.min(8, 6.5 * Math.min(1.2, scale)));

      let endX = target.x;
      let endY = target.y;
      if (showArrows && dist > targetR + arrowLen) {
        const ux = dx / dist;
        const uy = dy / dist;
        endX = target.x - ux * (targetR + arrowLen);
        endY = target.y - uy * (targetR + arrowLen);
      }

      ctx.lineTo(endX, endY);
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = width;
      ctx.stroke();
      ctx.restore();

      if (showArrows) {
        drawArrowhead(ctx, source.x, source.y, target.x, target.y, targetR, strokeColor, alpha);
      }
    }

    // 3. Draw Nodes (Flat Matte Circles matching Obsidian Graph screenshot)
    for (const node of simNodes) {
      const isSelected = node.id === selectedConceptId;
      const isHovered = hoveredNode && node.id === hoveredNode.id;
      const isNeighbor = spotlightIds ? spotlightIds.has(node.id) : false;
      const matchesSearch = searchLower && (node.raw.label?.toLowerCase().includes(searchLower) || node.raw.definition?.toLowerCase().includes(searchLower));

      let alpha = 1.0;
      if (hoveredNode) {
        alpha = isHovered || isNeighbor ? 1.0 : 0.12;
      } else if (searchLower && !matchesSearch) {
        alpha = 0.15;
      }

      ctx.save();
      ctx.globalAlpha = alpha;

      // Solid flat circular disc (Obsidian hallmark)
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
      ctx.fillStyle = node.color;
      ctx.fill();

      // Selection indicator ring
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius + 4, 0, Math.PI * 2);
        ctx.strokeStyle = palette.selectRing;
        ctx.lineWidth = 2.2;
        ctx.stroke();
      }

      // Hover spotlight ring
      if (isHovered) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius + 3, 0, Math.PI * 2);
        ctx.strokeStyle = palette.hoverRing;
        ctx.lineWidth = 1.8;
        ctx.stroke();
      }

      // Search match highlight ring
      if (matchesSearch) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius + 5, 0, Math.PI * 2);
        ctx.strokeStyle = '#d89a3a';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // 4. Floating Typography / Labels (Obsidian style: clean floating text without boxes)
      const isHub = (node.degree || 0) >= 3 || node.raw.concept_type === 'module';
      const showLabel = showAllLabels || isSelected || isHovered || isNeighbor || matchesSearch || (isHub && scale > 0.55) || (scale > 1.25);

      if (showLabel) {
        const currentFontSize = Math.max(8, Math.min(16, textSize * (0.88 + 0.12 / Math.max(0.6, scale))));
        ctx.font = `${isHovered || isSelected || isHub ? '600' : '400'} ${currentFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", sans-serif`;

        const rawText = node.raw.label || node.id;
        const maxChars = Math.floor(34 / Math.max(0.6, scale));
        const displayText = rawText.length > maxChars ? rawText.slice(0, maxChars) + '…' : rawText;

        const textY = node.y + node.radius + 12;

        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';

        // Subtle contrast halo to ensure legibility when intersecting link lines
        ctx.strokeStyle = palette.textHalo;
        ctx.lineWidth = 3.2;
        ctx.lineJoin = 'round';
        ctx.strokeText(displayText, node.x, textY);

        // Crisp text fill
        ctx.fillStyle = isHovered || isSelected ? palette.textHighlight : (isNeighbor ? palette.textHighlight : palette.text);
        ctx.fillText(displayText, node.x, textY);
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
    startClient = { x: e.clientX, y: e.clientY };
    const world = screenToWorld(e.clientX, e.clientY);
    const hit = findNodeAt(world.x, world.y);

    if (hit) {
      draggedNode = hit;
      draggedNode.fx = hit.x;
      draggedNode.fy = hit.y;
      if (simulation) simulation.alphaTarget(0.25).restart();
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
    const dist = Math.hypot(e.clientX - startClient.x, e.clientY - startClient.y);
    if (draggedNode) {
      if (dist < 5) {
        onSelect(draggedNode.id);
      }
      draggedNode.fx = null;
      draggedNode.fy = null;
      draggedNode = null;
      if (simulation) simulation.alphaTarget(0);
    } else if (isPanning) {
      // If user clicked the canvas background without panning, dismiss open selection
      if (dist < 5 && selectedConceptId) {
        onSelect('');
      }
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
    const newScale = Math.max(0.2, Math.min(3.8, scale * zoomFactor));

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

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of simNodes) {
      if (n.x == null || n.y == null) continue;
      const r = n.radius + 28;
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

    const bw = Math.max(100, maxX - minX);
    const bh = Math.max(100, maxY - minY);
    const newScale = Math.max(0.25, Math.min(1.8, Math.min(W / bw, H / bh) * 0.88));
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
    simulation.force('collision', forceCollide().radius(d => d.radius + 6));
    simulation.alpha(0.35).restart();
  }

  // Update node colors/radii when theme or nodeSizeMultiplier changes
  $effect(() => {
    const currentTheme = theme;
    const currentMult = nodeSizeMultiplier;
    for (const node of simNodes) {
      node.color = getNodeColor(node, currentTheme);
      node.radius = getNodeRadius(node.degree, node.raw.concept_type || node.raw.level);
    }
  });

  $effect(() => {
    // Re-run simulation when graph structure or filter toggles change
    graph;
    showKCs;
    showMisconceptions;
    showProbes;
    showModules;
    focusMode;
    focusDepth;
    selectedConceptId;
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
      isDestroyed = true;
      window.removeEventListener('resize', updateSize);
      if (animFrameId) {
        cancelAnimationFrame(animFrameId);
        animFrameId = null;
      }
      if (simulation) {
        simulation.stop();
        simulation = null;
      }
    };
  });

  onDestroy(() => {
    isDestroyed = true;
    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
    if (simulation) {
      simulation.stop();
      simulation = null;
    }
  });
</script>

<div class="obsidian-graph-shell" class:light-mode={theme === 'light'} class:dark-mode={theme === 'dark'} bind:this={containerRef}>
  <canvas
    bind:this={canvasRef}
    class="obsidian-canvas"
    onpointerdown={handlePointerDown}
    onpointermove={handlePointerMove}
    onpointerup={handlePointerUp}
    onwheel={handleWheel}
  ></canvas>

  <!-- Obsidian Graph Settings HUD Panel -->
  <div class="obsidian-hud" class:collapsed={!hudOpen}>
    <header class="hud-header">
      <div class="hud-title">
        <span class="hud-icon">✦</span>
        <span>Graph View</span>
      </div>
      <div class="hud-header-actions">
        <!-- Theme Switcher: Light (Screenshot) vs Dark -->
        <div class="theme-toggle-group">
          <button
            type="button"
            class="theme-btn"
            class:active={theme === 'light'}
            onclick={() => toggleTheme('light')}
            title="Obsidian Light Mode (as in reference)"
          >
            ☀ Light
          </button>
          <button
            type="button"
            class="theme-btn"
            class:active={theme === 'dark'}
            onclick={() => toggleTheme('dark')}
            title="Obsidian Dark Mode"
          >
            ☾ Dark
          </button>
        </div>
        <button type="button" class="hud-toggle-btn" onclick={() => hudOpen = !hudOpen} aria-label="Toggle Controls">
          {hudOpen ? '−' : '+'}
        </button>
      </div>
    </header>

    {#if hudOpen}
      <div class="hud-body">
        <!-- Tab navigation -->
        <nav class="hud-tabs">
          <button type="button" class="tab-btn" class:active={activeTab === 'filters'} onclick={() => activeTab = 'filters'}>Filters</button>
          <button type="button" class="tab-btn" class:active={activeTab === 'display'} onclick={() => activeTab = 'display'}>Display</button>
          <button type="button" class="tab-btn" class:active={activeTab === 'forces'} onclick={() => activeTab = 'forces'}>Forces</button>
        </nav>

        {#if activeTab === 'filters'}
          <!-- Search filter -->
          <div class="hud-section">
            <label for="graph-search">Search</label>
            <input
              id="graph-search"
              type="text"
              placeholder="Search concepts or notes..."
              bind:value={searchQuery}
            />
          </div>

          <div class="hud-section">
            <span class="section-label">Focus</span>
            <label class="checkbox-pill focus">
              <input type="checkbox" bind:checked={focusMode} />
              <span>Only the selected node</span>
            </label>
            {#if focusMode}
              <div class="focus-depth">
                <button type="button" class:on={focusDepth === 1} onclick={() => (focusDepth = 1)}>Direct links</button>
                <button type="button" class:on={focusDepth === 2} onclick={() => (focusDepth = 2)}>Two hops</button>
              </div>
              {#if !selectedConceptId}
                <p class="focus-hint">Click a node to focus on it.</p>
              {/if}
            {/if}
          </div>

          <!-- Color Groups / Toggles (matching the screenshot) -->
          <div class="hud-section">
            <span class="section-label">Groups & Categories</span>
            <div class="toggle-group">
              <label class="checkbox-pill kc">
                <input type="checkbox" bind:checked={showKCs} />
                <span class="dot kc-dot"></span>
                <span>Concepts & KCs</span>
              </label>
              <label class="checkbox-pill misc">
                <input type="checkbox" bind:checked={showMisconceptions} />
                <span class="dot misc-dot"></span>
                <span>Cognitive Traps (Red)</span>
              </label>
              <label class="checkbox-pill probe">
                <input type="checkbox" bind:checked={showProbes} />
                <span class="dot probe-dot"></span>
                <span>Diagnostic Probes (Gold)</span>
              </label>
              <label class="checkbox-pill module">
                <input type="checkbox" bind:checked={showModules} />
                <span class="dot module-dot"></span>
                <span>Curriculum Modules</span>
              </label>
            </div>
          </div>
        {:else if activeTab === 'display'}
          <!-- Display Controls -->
          <div class="hud-section">
            <div class="slider-row">
              <span>Node Size</span>
              <input type="range" min="0.6" max="2.2" step="0.1" bind:value={nodeSizeMultiplier} />
            </div>
            <div class="slider-row">
              <span>Link Thickness</span>
              <input type="range" min="0.5" max="3.0" step="0.25" bind:value={linkThickness} />
            </div>
            <div class="slider-row">
              <span>Text Size</span>
              <input type="range" min="8" max="16" step="1" bind:value={textSize} />
            </div>
            <div class="checkbox-row">
              <label class="toggle-label">
                <input type="checkbox" bind:checked={showArrows} />
                <span>Show Directional Arrows</span>
              </label>
            </div>
            <div class="checkbox-row">
              <label class="toggle-label">
                <input type="checkbox" bind:checked={showAllLabels} />
                <span>Show All Text Labels</span>
              </label>
            </div>
          </div>
        {:else if activeTab === 'forces'}
          <!-- Force Simulation Controls -->
          <div class="hud-section">
            <div class="slider-row">
              <span>Center Force</span>
              <input type="range" min="0.01" max="0.25" step="0.01" bind:value={centerGravity} />
            </div>
            <div class="slider-row">
              <span>Repulsion (Charge)</span>
              <input type="range" min="-550" max="-80" step="20" bind:value={repulsion} />
            </div>
            <div class="slider-row">
              <span>Link Distance</span>
              <input type="range" min="40" max="200" step="10" bind:value={linkDistance} />
            </div>
          </div>
        {/if}

        <!-- Quick Actions -->
        <div class="hud-actions">
          <button type="button" class="btn-hud" onclick={recenterGraph}>
            ⟲ Reset View
          </button>
          <button type="button" class="btn-hud" onclick={() => { if (simulation) simulation.alpha(0.6).restart(); }}>
            ⚡ Reheat
          </button>
        </div>
      </div>
    {/if}
  </div>

  <!-- Zoom & Count badge in bottom left -->
  <div class="zoom-badge">
    <span>Zoom: {Math.round(scale * 100)}%</span>
    <span>{nodeCount} Nodes · {linkCount} Links</span>
  </div>

  <!-- Interactive Node Hover Tooltip -->
  {#if hoveredNode}
    <div
      class="node-tooltip"
      style="left: {mousePos.x + 14}px; top: {mousePos.y - 12}px;"
    >
      <div class="tooltip-header">
        <span
          class="tooltip-tag"
          style="background: {hoveredNode.color}22; color: {hoveredNode.color}; border: 1px solid {hoveredNode.color}44;"
        >
          {hoveredNode.raw.concept_type || hoveredNode.raw.level}
        </span>
        <span class="tooltip-degree">{hoveredNode.degree} {hoveredNode.degree === 1 ? 'connection' : 'connections'}</span>
      </div>
      <strong class="tooltip-title">{hoveredNode.raw.label}</strong>
      {#if hoveredNode.raw.definition}
        <p class="tooltip-def">{hoveredNode.raw.definition}</p>
      {/if}
      <span class="tooltip-hint">Click node to inspect details</span>
    </div>
  {/if}
</div>

<style>
  .obsidian-graph-shell {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 650px;
    overflow: hidden;
    user-select: none;
    transition: background-color 0.25s ease;
  }

  .obsidian-graph-shell.light-mode {
    background-color: #ffffff;
    color: #1e293b;
  }

  .obsidian-graph-shell.dark-mode {
    background-color: #161616;
    color: #f1f5f9;
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

  /* Obsidian Graph Settings Floating Panel */
  .obsidian-hud {
    position: absolute;
    top: 14px;
    right: 14px;
    width: 260px;
    border-radius: 8px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, sans-serif;
    font-size: 11px;
    z-index: 20;
    transition: width 0.2s ease, opacity 0.2s ease;
  }

  .light-mode .obsidian-hud {
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    border: 1px solid rgba(0, 0, 0, 0.12);
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
    color: #334155;
  }

  .dark-mode .obsidian-hud {
    background: rgba(24, 24, 27, 0.88);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    border: 1px solid rgba(255, 255, 255, 0.12);
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.55);
    color: #e2e8f0;
  }

  .obsidian-hud.collapsed {
    width: auto;
  }

  .hud-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.08);
  }
  .dark-mode .hud-header {
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .hud-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-weight: 600;
    font-size: 11.5px;
    letter-spacing: 0.2px;
  }
  .hud-icon {
    font-size: 11px;
    color: #e59b2c;
  }

  .hud-header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .theme-toggle-group {
    display: flex;
    background: rgba(0, 0, 0, 0.06);
    border-radius: 4px;
    padding: 2px;
    gap: 2px;
  }
  .dark-mode .theme-toggle-group {
    background: rgba(255, 255, 255, 0.08);
  }

  .theme-btn {
    background: transparent;
    border: none;
    border-radius: 3px;
    font-size: 9.5px;
    font-weight: 600;
    padding: 2px 6px;
    cursor: pointer;
    color: #64748b;
    transition: all 0.15s ease;
  }
  .dark-mode .theme-btn {
    color: #94a3b8;
  }
  .theme-btn.active {
    background: #ffffff;
    color: #0f172a;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
  }
  .dark-mode .theme-btn.active {
    background: #27272a;
    color: #f8fafc;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
  }

  .hud-toggle-btn {
    background: transparent;
    border: none;
    color: #64748b;
    cursor: pointer;
    font-size: 13px;
    padding: 0 3px;
  }
  .hud-toggle-btn:hover {
    color: #0f172a;
  }
  .dark-mode .hud-toggle-btn:hover {
    color: #ffffff;
  }

  .hud-body {
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .hud-tabs {
    display: flex;
    border-bottom: 1px solid rgba(0, 0, 0, 0.08);
    gap: 4px;
    padding-bottom: 6px;
  }
  .dark-mode .hud-tabs {
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .tab-btn {
    background: transparent;
    border: none;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 600;
    padding: 4px 8px;
    cursor: pointer;
    color: #64748b;
    transition: all 0.15s ease;
  }
  .tab-btn:hover {
    color: #0f172a;
  }
  .dark-mode .tab-btn {
    color: #94a3b8;
  }
  .dark-mode .tab-btn:hover {
    color: #f8fafc;
  }
  .tab-btn.active {
    background: rgba(0, 0, 0, 0.08);
    color: #0f172a;
  }
  .dark-mode .tab-btn.active {
    background: rgba(255, 255, 255, 0.12);
    color: #ffffff;
  }

  .hud-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .section-label,
  .hud-section label {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.4px;
    text-transform: uppercase;
    color: #64748b;
  }
  .dark-mode .section-label,
  .dark-mode .hud-section label {
    color: #94a3b8;
  }

  .hud-section input[type="text"] {
    background: #ffffff;
    border: 1px solid #cbd5e1;
    border-radius: 4px;
    color: #0f172a;
    font-size: 11px;
    padding: 5px 8px;
    outline: none;
    transition: border-color 0.15s ease;
  }
  .hud-section input[type="text"]:focus {
    border-color: #2563eb;
  }
  .dark-mode .hud-section input[type="text"] {
    background: #18181b;
    border: 1px solid #3f3f46;
    color: #f8fafc;
  }
  .dark-mode .hud-section input[type="text"]:focus {
    border-color: #60a5fa;
  }

  .toggle-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .focus-depth { display: flex; gap: 6px; margin-top: 8px; }
  .focus-depth button {
    flex: 1; font: inherit; font-size: 11px; cursor: pointer;
    padding: 4px 8px; border-radius: 6px;
    border: 1px solid rgba(148, 163, 184, 0.45);
    background: transparent; color: inherit; opacity: 0.75;
  }
  .focus-depth button.on { opacity: 1; border-color: #38bdf8; background: rgba(56, 189, 248, 0.14); }
  .focus-hint { margin: 8px 0 0; font-size: 11px; opacity: 0.7; }

  .checkbox-pill {
    display: flex;
    align-items: center;
    gap: 7px;
    cursor: pointer;
    font-size: 11px;
    color: #475569;
    padding: 2px 0;
  }
  .checkbox-pill:hover {
    color: #0f172a;
  }
  .dark-mode .checkbox-pill {
    color: #cbd5e1;
  }
  .dark-mode .checkbox-pill:hover {
    color: #ffffff;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    display: inline-block;
  }
  .kc-dot { background: #5c5c5c; }
  .misc-dot { background: #e05252; }
  .probe-dot { background: #e59b2c; }
  .module-dot { background: #242424; }
  .dark-mode .kc-dot { background: #a1a1aa; }
  .dark-mode .misc-dot { background: #ef5350; }
  .dark-mode .probe-dot { background: #d89a3a; }
  .dark-mode .module-dot { background: #f4f4f5; }

  .slider-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: 10px;
    color: #475569;
  }
  .dark-mode .slider-row {
    color: #94a3b8;
  }
  .slider-row input[type="range"] {
    width: 115px;
    accent-color: #475569;
    cursor: pointer;
  }
  .dark-mode .slider-row input[type="range"] {
    accent-color: #a1a1aa;
  }

  .checkbox-row {
    display: flex;
    align-items: center;
    padding: 2px 0;
  }
  .toggle-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 10.5px;
    color: #475569;
    cursor: pointer;
  }
  .dark-mode .toggle-label {
    color: #cbd5e1;
  }

  .hud-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    margin-top: 4px;
    padding-top: 6px;
    border-top: 1px solid rgba(0, 0, 0, 0.08);
  }
  .dark-mode .hud-actions {
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  .btn-hud {
    background: #f1f5f9;
    border: 1px solid #cbd5e1;
    border-radius: 4px;
    color: #334155;
    cursor: pointer;
    font-size: 10px;
    font-weight: 500;
    padding: 5px 8px;
    text-align: center;
    transition: all 0.15s ease;
  }
  .btn-hud:hover {
    background: #e2e8f0;
    border-color: #94a3b8;
    color: #0f172a;
  }
  .dark-mode .btn-hud {
    background: rgba(39, 39, 42, 0.8);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: #f1f5f9;
  }
  .dark-mode .btn-hud:hover {
    background: rgba(63, 63, 70, 0.9);
    border-color: #a1a1aa;
  }

  .zoom-badge {
    position: absolute;
    bottom: 14px;
    left: 14px;
    border-radius: 4px;
    display: flex;
    gap: 10px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", monospace;
    font-size: 10px;
    padding: 4px 8px;
    pointer-events: none;
    transition: all 0.2s ease;
  }
  .light-mode .zoom-badge {
    background: rgba(255, 255, 255, 0.9);
    border: 1px solid rgba(0, 0, 0, 0.1);
    color: #64748b;
  }
  .dark-mode .zoom-badge {
    background: rgba(24, 24, 27, 0.85);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #94a3b8;
  }

  /* Node Hover Tooltip */
  .node-tooltip {
    position: fixed;
    pointer-events: none;
    border-radius: 6px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, sans-serif;
    max-width: 270px;
    padding: 9px 12px;
    z-index: 50;
    transition: opacity 0.1s ease;
  }
  .light-mode .node-tooltip {
    background: rgba(255, 255, 255, 0.96);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(0, 0, 0, 0.14);
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.12);
    color: #1e293b;
  }
  .dark-mode .node-tooltip {
    background: rgba(24, 24, 27, 0.94);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.15);
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.65);
    color: #f8fafc;
  }

  .tooltip-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 5px;
  }
  .tooltip-tag {
    border-radius: 3px;
    font-size: 8.5px;
    font-weight: 700;
    letter-spacing: 0.3px;
    padding: 2px 5px;
    text-transform: uppercase;
  }
  .tooltip-degree {
    font-size: 9px;
    color: #64748b;
  }
  .dark-mode .tooltip-degree {
    color: #94a3b8;
  }

  .tooltip-title {
    display: block;
    font-size: 12px;
    line-height: 1.35;
    margin-bottom: 4px;
    color: #0f172a;
  }
  .dark-mode .tooltip-title {
    color: #ffffff;
  }

  .tooltip-def {
    font-size: 10.5px;
    line-height: 1.4;
    color: #475569;
    margin: 0 0 5px 0;
  }
  .dark-mode .tooltip-def {
    color: #cbd5e1;
  }

  .tooltip-hint {
    color: #2563eb;
    font-size: 9px;
    font-style: italic;
  }
  .dark-mode .tooltip-hint {
    color: #60a5fa;
  }
</style>
