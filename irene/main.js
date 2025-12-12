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
    });

  // Enable zoom/pan with mouse
  ctx.svg.call(ctx.zoom);

  // Zoom buttons (+ / -)
  setupZoomButtons();
  setupPageNavigation();
  setupSidebarNav();

  // Load data
  loadData();
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

      drawBaseMap();
      setupFilterListeners();
      updatePoints();

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

  const symbols = d3.symbol().size(40).type(d3.symbolCircle);

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
    .on("mouseout", handleMouseOut);

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


