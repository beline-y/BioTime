// Global context
const ctx = {
  WIDTH: 0,
  HEIGHT: 0,
  LEFT_OFFSET: 260, // must match sidebar width
  svg: null,
  g: null,
  gMap: null,
  gPoints: null,
  projection: null,
  path: null,
  zoom: null,
  studies: [],
  world: null,
  tooltip: null
};

// Main entry point
function createViz() {
  console.log("Using D3 v" + d3.version);
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  window.addEventListener("load", () => window.scrollTo(0, 0));

  // Full-height viz, width = window - sidebar
  ctx.WIDTH = document.body.clientWidth - ctx.LEFT_OFFSET;
  ctx.HEIGHT = window.innerHeight;

  const container = d3.select("#map-container");
  ctx.tooltip = d3.select("#tooltip");

  ctx.svg = container.append("svg")
    .attr("width", ctx.WIDTH)
    .attr("height", ctx.HEIGHT)
    .style("display", "block");

  // Group container (will be zoomed)
  ctx.g = ctx.svg.append("g");
  ctx.gMap = ctx.g.append("g");
  ctx.gPoints = ctx.g.append("g");

  // Mercator projection 
  ctx.projection = d3.geoMercator()
    .scale((ctx.WIDTH / 2 / Math.PI) * 1.2)   // fills width, a bit extra for immersion
    .translate([ctx.WIDTH / 2, ctx.HEIGHT / 2]);

  ctx.path = d3.geoPath().projection(ctx.projection);

  // Zoom + pan
  ctx.zoom = d3.zoom()
    .scaleExtent([1, 12])
    .on("zoom", function (event) {
      ctx.g.attr("transform", event.transform);

      const k = event.transform.k;

      ctx.gPoints
        .selectAll("path.study")
        .attr(
          "d",
          d3.symbol()
            .type(d3.symbolCircle)
            .size(ctx.BASE_SYMBOL_SIZE / k)
        )
        .attr("stroke-width", 0.4/(0.5*k));
    });

  // Enable zoom/pan with mouse
  ctx.svg.call(ctx.zoom);

  // Zoom buttons (+ / -)
  setupZoomButtons();
  setupPageNavigation();
  setupSidebarNav();

  renderKPIBar([
  { value: 708, label: "studies" },
  { value: 130, label: "years" },
  { value: 598, label: "contributors" },
  { value: 9,   label: "taxa groups" },
  { value: 36,  label: "biomes" }
  ]);

  // Load data
  loadData();
  resetMapZoom();

}

// Attach click handlers to the + / − buttons
function setupZoomButtons() {
  const zoomInBtn = d3.select("#zoom-in");
  const zoomOutBtn = d3.select("#zoom-out");

  zoomInBtn.on("click", function () {
    ctx.svg
      .transition()
      .duration(300)
      .call(ctx.zoom.scaleBy, 1.4);
  });

  zoomOutBtn.on("click", function () {
    ctx.svg
      .transition()
      .duration(300)
      .call(ctx.zoom.scaleBy, 1 / 1.4);
  });
}

// Load world + studies
function loadData() {
  Promise.all([
    d3.json("../data/world-110m.json"),
    d3.json("../data/studies.json")
  ])
    .then(function (values) {
      ctx.world = values[0];
      ctx.studies = values[1];
      console.log(ctx.studies)
      drawBaseMap();
      setupFilterListeners();
      updatePoints();
      createPhyloTreemap();
      createStudyTimeline(ctx.studies)

    })
    .catch(function (err) {
      console.error("Erreur chargement données :", err);
    });
}

// Draw world map
function drawBaseMap() {
  if (!ctx.world || !ctx.world.objects || !ctx.world.objects.countries) {
    console.error("Format world-110m.json inattendu :", ctx.world);
    return;
  }

  const land = topojson.feature(ctx.world, ctx.world.objects.countries);

  // Draw the land with current projection
  ctx.gMap.append("path")
    .datum(land)
    .attr("d", ctx.path)
    .attr("fill", "#e0dbe7ff")
    .attr("stroke", "#aaa")
    .attr("stroke-width", 0.5);

  // Compute projected bounds of the map
  const [[x0, y0], [x1, y1]] = ctx.path.bounds(land);
  const margin = 0;

  // Configure zoom so panning is allowed but never shows empty space
  ctx.zoom
    .extent([[0, 0], [ctx.WIDTH, ctx.HEIGHT]])
    .translateExtent([
      [x0 - margin, y0 - margin],
      [x1 + margin, y1 + margin]
    ]);

  // Re-attach zoom with updated extents
  ctx.svg.call(ctx.zoom);
}


function applyFilters() {
  const realmValue = d3.select("#realm-select").property("value"); 
  const protectedOnly = d3.select("#protected-only").property("checked");

  return ctx.studies.filter(d => {
    // filter realm
    if (realmValue !== "all" &&
        d.realm !== realmValue) {
      return false;
    }

    // filter protected
    if (protectedOnly &&
        d.protected_area !== "TRUE") {
      return false;
    }

    return true;
  });
}




function setupFilterListeners() {
  d3.select("#realm-select").on("change", updatePoints);
  d3.select("#protected-only").on("change", updatePoints);
}


function handleMouseOver(event, d) {
  ctx.tooltip
    .style("opacity", 1)
    .html(`
      <div id="tooltip-title">Study ${d.study_id}</div>
      <div id="tooltip-preview">
        graph preview
      </div>
    `);
}

function handleMouseMove(event) {
  const rect = document.getElementById("map-container").getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  ctx.tooltip
    .style("left", (x + 15) + "px")
    .style("top", (y + 15) + "px");
}

function handleMouseOut() {
  ctx.tooltip.style("opacity", 0);
}


function updatePoints() {
  const data = applyFilters();

  ctx.BASE_SYMBOL_SIZE = 40;

  const symbols = d3.symbol().size(ctx.BASE_SYMBOL_SIZE).type(d3.symbolCircle);

  const points = ctx.gPoints
    .selectAll("path.study")
    .data(data, d => d.study_id); 

  minDuration = d3.min(data, d => d.duration);
  maxDuration = d3.max(data, d => d.duration);

  const colorScale = d3.scaleLinear().domain([minDuration, maxDuration]).range(["lightblue", "darkblue"]);

  // EXIT:
  points.exit().remove();

  // ENTER:
  const entered = points.enter()
    .append("path")
    .attr("class", "study")
    .attr("d", symbols)
    //.attr("fill", "#2684ac")
    .attr("fill", d => colorScale(d.duration))
    .attr("stroke", "#333")
    .attr("stroke-width", 0.4)
    .on("mouseover", handleMouseOver)
    .on("mousemove", handleMouseMove)
    .on("mouseout", handleMouseOut)
    .on("click", (event, d) => {
    // optionnel : mémoriser l’étude cliquée
    ctx.selectedStudy = d;

    // scroll vers la page Studies
    document
      .getElementById("page-3")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  // ENTER + UPDATE: positionner correctement
  entered.merge(points)
    .attr("transform", d => {
      const p = ctx.projection([d.lon, d.lat]);
      return `translate(${p[0]}, ${p[1]})`;
    });

  // --- UPDATE LEGEND ---
  updateLegend(minDuration, maxDuration);
}


function updateLegend(minVal, maxVal) {
  const legend = d3.select("#legend-duration");

  // créer le contenu la première fois
  if (legend.selectAll("*").empty()) {
    legend.html(`
      <div class="legend-title">Duration (years)</div>
      <div class="legend-bar"></div>
      <div class="legend-labels">
        <span class="legend-min"></span>
        <span class="legend-max"></span>
      </div>
    `);
  }

  legend.select(".legend-min").text(minVal);
  legend.select(".legend-max").text(maxVal);
}


function setupPageNavigation() {
  const btn = document.getElementById("next-page-btn");
  if (!btn) return;

  const order = ["page-map", "page-2", "page-3"];

  btn.addEventListener("click", () => {
    const y = window.scrollY + window.innerHeight * 0.4;

    // trouve la section la plus "proche" du viewport
    let currentIdx = 0;
    for (let i = 0; i < order.length; i++) {
      const el = document.getElementById(order[i]);
      if (!el) continue;
      if (el.offsetTop <= y) currentIdx = i;
    }

    const nextId = order[Math.min(currentIdx + 1, order.length - 1)];
    document.getElementById(nextId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}



function setupSidebarNav() {
  const buttons = Array.from(document.querySelectorAll(".nav-link"));
  const sections = buttons
    .map(b => document.getElementById(b.dataset.target))
    .filter(Boolean);

  // click -> scroll
  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      document.getElementById(btn.dataset.target)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });

    });
  });

  // scroll -> active state
  const observer = new IntersectionObserver((entries) => {
    const visible = entries
      .filter(e => e.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

    if (!visible) return;

    document.body.classList.toggle("map-filters-hidden", visible.target.id !== "page-map");

    buttons.forEach(b => b.classList.remove("active"));
    const activeBtn = buttons.find(b => b.dataset.target === visible.target.id);
    if (activeBtn) activeBtn.classList.add("active");
  }, {
    threshold: [0.35, 0.55, 0.75]
  });

  sections.forEach(sec => observer.observe(sec));
}

function resetMapZoom() {
  if (!ctx.svg || !ctx.zoom) return;

  ctx.svg
    .transition()
    .duration(0)
    .call(ctx.zoom.transform, d3.zoomIdentity);
}



function truncateLabel(text, d) {
  const w = d.x1 - d.x0;
  const h = d.y1 - d.y0;

  // si vraiment minuscule → 1 caractère + …
  if (w < 40 || h < 20) return text[0] + "…";

  // estimation grossière : ~7px par caractère
  const maxChars = Math.floor(w / 7);

  if (text.length <= maxChars) return text;
  if (maxChars <= 3) return text.slice(0, 1) + "…";

  return text.slice(0, maxChars - 1) + "…";
}


function tileByDepth(node, x0, y0, x1, y1) {
  // depth 0 = root
  // depth 1 = grands groupes → empilés en hauteur
  if (node.depth === 1) {
    return d3.treemapSlice(node, x0, y0, x1, y1);
  }
  // le reste = layout standard
  return d3.treemapBinary(node, x0, y0, x1, y1);
}




// --- Treemap: phylogenetic hierarchy (JSON) ---
function createPhyloTreemap() {
  const host = d3.select("#phylo-panel");
  if (host.empty()) return;

  host.selectAll("*").remove();

  const nodeEl = host.node();

  // ---- Taille + "prend moins de place" ----
  const width = Math.floor((nodeEl.getBoundingClientRect().width)|| 900);
  const height = 580;            // <-- baisse la hauteur (ex: 320-380)
  const titleheight = 25

  const svg = host.append("svg")
    .attr("width", width)
    .attr("height", height);

  svg.append("text")
      .attr("x", width / 2)
      .attr("y", 15)   
      .attr("text-anchor", "middle")
      .style("font-size", "14px")
      .style("font-weight", 700)
      .style("fill", "#0f172a")
      .text("Number of studies by major evolutionary lineage");

  d3.json("../data/organism_groups_phylo_rows.json").then(rows => {
    // ---- Stratify ----
    const root = d3.stratify()
      .id(d => d.Code)
      .parentId(d => d.Parent)
      (rows);

    // DOM ids safe
    root.eachBefore(d => {
      d.data.id = d.data.Code
        .replaceAll(">", "_")
        .replaceAll("|", "_")
        .replaceAll(/[^\w\-]/g, "");
    });

    // Sum leaf values
    root.sum(d => d.Amount || 0);

    // ---- Treemap ----
    const treemap = d3.treemap()
      .tile(tileByDepth)
      .size([width, height - titleheight])
      .paddingInner(5)
      .paddingOuter(25);


    treemap(root);

    // ---- Couleurs : par grand groupe (enfant direct du root) ----
    // On colore selon l'ancêtre à depth=1 (le "top group").
    function topGroup(d) {
      // root.depth = 0 ; ses enfants depth = 1
      const a = d.ancestors().reverse();
      return a[1] ? (a[1].data.Description || a[1].id) : (a[0]?.data.Description || "root");
    }

    const topGroups = Array.from(new Set(root.descendants().map(d => topGroup(d))));
    const color = d3.scaleOrdinal()
      .domain(topGroups)
      .range(d3.schemeTableau10.concat(d3.schemeSet3)); // palette sympa (si plus de 10)

    // ---- Draw ----
    const gTreemap = svg.append("g")
      .attr("transform", `translate(0, ${titleheight})`); //décale pour le titre

    const nodes = gTreemap.selectAll("g.node")
      .data(root.descendants())
      .enter()
      .append("g")
      .attr("class", d => `node ${d.children ? "internal" : "leaf"}`)
      .attr("transform", d => `translate(${d.x0},${d.y0})`);

    // Rects
    nodes.append("rect")
      .attr("id", d => d.data.id)
      .attr("width", d => Math.max(0, d.x1 - d.x0))
      .attr("height", d => Math.max(0, d.y1 - d.y0))
      .attr("rx", d => d.children ? 12 : 14)
      .attr("fill", d => {
        // Parents: plus clair, Leaves: plus saturé
        const c = d3.color(color(topGroup(d)));
        if (!c) return "rgba(0,0,0,0.06)";
        return d.children ? c.copy({ opacity: 0.18 }) : c.copy({ opacity: 0.45 });
      })
      .attr("stroke", d => {
        const c = d3.color(color(topGroup(d)));
        return c ? c.copy({ opacity: 0.55 }) : "rgba(15, 23, 42, 0.25)";
      })
      .append("title")
      .text(d => {
        const path = d.ancestors().map(a => a.data.Description).reverse().join(" → ");
        return `${path} : ${d.value}`;
      });

    // ---- ClipPaths pour labels (leaves + internes) ----
    nodes.append("clipPath")
      .attr("id", d => "clip-" + d.data.id)
      .append("use")
      .attr("xlink:href", d => "#" + d.data.id);

    // Helpers taille
    const w = d => Math.max(0, d.x1 - d.x0);
    const h = d => Math.max(0, d.y1 - d.y0);

    // ---- Titres des groupes internes ----
    // Affichés uniquement si la boîte est assez grande.
    nodes.filter(d => d.children)
      .append("text")
      .attr("clip-path", d => `url(#clip-${d.data.id})`)
      .attr("x", 8)
      .attr("y", 16)
      .style("font-size", "12px")
      .style("font-weight", 800)
      .style("fill", "rgba(15, 23, 42, 0.80)")
      .style("pointer-events", "none")
      .text(d => d.data.Description)
      .attr("display", d => (w(d) >= 90 && h(d) >= 26) ? null : "none");

    // Petite ligne valeur pour internes (optionnel)
    nodes.filter(d => d.children)
      .append("text")
      .attr("clip-path", d => `url(#clip-${d.data.id})`)
      .attr("x", 8)
      .attr("y", 32)
      .style("font-size", "11px")
      .style("font-weight", 600)
      .style("fill", "rgba(15, 23, 42, 0.55)")
      .style("pointer-events", "none")
      .text(d => d.value)
      .attr("display", d => (w(d) >= 70 && h(d) >= 40) ? null : "none");

    // ---- Labels feuilles ----
    nodes.filter(d => !d.children)
      .append("text")
      .attr("clip-path", d => `url(#clip-${d.data.id})`)
      .attr("x", 8)
      .attr("y", 18)
      .style("font-size", "11px")
      .style("font-weight", 700)
      .style("fill", "rgba(15, 23, 42, 0.85)")
      .style("pointer-events", "none")
      .text(d => truncateLabel(d.data.Description || "", d));


    // Valeur feuille (si assez grand)
    nodes.filter(d => !d.children)
      .append("text")
      .attr("clip-path", d => `url(#clip-${d.data.id})`)
      .attr("x", 8)
      .attr("y", 44)
      .style("font-size", "11px")
      .style("fill", "rgba(15, 23, 42, 0.55)")
      .style("pointer-events", "none")
      .text(d => d.value)
      ;

      

  }).catch(err => console.error(err));
}



function renderKPIBar(stats) {
  // stats: [{value:708,label:"studies"}, ...]
  const bar = d3.select("#kpi-bar");
  bar.selectAll("*").remove();

  const kpi = bar.selectAll(".kpi")
    .data(stats)
    .enter()
    .append("div")
    .attr("class", "kpi");

  kpi.append("div")
    .attr("class", "value")
    .text(d => d.value);

  kpi.append("div")
    .attr("class", "label")
    .text(d => d.label);
}






function createStudyTimeline(meta) {
  const host = d3.select("#timeline-panel");
  if (host.empty()) return;
  host.selectAll("*").remove();

  const nodeEl = host.node();
  const width  = Math.floor((nodeEl.getBoundingClientRect().width));
  const height = 360;

  const margin = { top: 28, right: 1, bottom: 26, left: 4 };

  const svg = host.append("svg")
    .attr("width", width)
    .attr("height", height);

  // ---- parse + keep valid ----
  const studies = meta
    .map(d => ({
      start: +d.start_year,
      end: +d.end_year,
      realm: (d.realm || "Unknown")
    }))
    .filter(d => Number.isFinite(d.start) && Number.isFinite(d.end) && d.end >= d.start);

  const minYear = d3.min(studies, d => d.start);
  const maxYear = d3.max(studies, d => d.end);

  const years = d3.range(minYear, maxYear + 1);

  // realms (order stable)
  const realms = ["Marine", "Terrestrial", "Freshwater", "Unknown"]
    .filter(r => studies.some(s => s.realm === r));

  // ---- build year x realm counts of ACTIVE studies ----
  // simple O(years*studies) ok for ~708*~150
  const rows = years.map(y => {
    const row = { year: y };
    for (const r of realms) row[r] = 0;
    for (const s of studies) {
      if (s.start <= y && s.end >= y) row[s.realm] = (row[s.realm] || 0) + 1;
    }
    return row;
  });

  // ---- scales ----
  const x = d3.scaleLinear()
    .domain([minYear, maxYear])
    .range([margin.left, width - margin.right]);

  const stack = d3.stack()
    .keys(realms)
    .order(d3.stackOrderNone)
    .offset(d3.stackOffsetNone);

  const series = stack(rows);

  const y = d3.scaleLinear()
    .domain([0, d3.max(series, s => d3.max(s, d => d[1])) || 1])
    .nice()
    .range([height - margin.bottom, margin.top]);

  const color = d3.scaleOrdinal()
    .domain(realms)
    .range(d3.schemeTableau10);

  const area = d3.area()
    .x(d => x(d.data.year))
    .y0(d => y(d[0]))
    .y1(d => y(d[1]));

  // ---- draw areas ----
  svg.append("g")
    .selectAll("path")
    .data(series)
    .enter()
    .append("path")
    .attr("d", area)
    .attr("fill", d => color(d.key))
    .attr("opacity", 0.65);

  // ---- axes ----
  svg.append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).ticks(6).tickFormat(d3.format("d")))
    .call(g => g.selectAll("text").style("font-size", "10px"));

  svg.append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(4))
    .call(g => g.selectAll("text").style("font-size", "10px"))
    .call(g => g.select(".domain").attr("opacity", 1));

  svg.append("text")
    .attr("x", margin.left)
    .attr("y", 18)
    .style("font-size", "13px")
    .style("font-weight", 800)
    .style("fill", "rgba(15,23,42,0.9)")
    .text("Active studies per year (stacked by realm)");

  // ---- simple legend ----
  const leg = svg.append("g")
    .attr("transform", `translate(${margin.left + 15},${margin.top + 6})`);

  realms.forEach((r, i) => {
    const g = leg.append("g").attr("transform", `translate(${i * 110},0)`);
    g.append("rect").attr("width", 10).attr("height", 10).attr("rx", 2)
      .attr("fill", color(r)).attr("opacity", 0.8);
    g.append("text").attr("x", 14).attr("y", 9)
      .style("font-size", "11px")
      .style("fill", "rgba(15,23,42,0.75)")
      .text(r);
  });
}
