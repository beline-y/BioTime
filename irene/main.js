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
  tooltip: null,
  selected_tool:"move" 
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
  ctx.g = ctx.svg.append("g").attr("id", "transformG");
  
  ctx.gMap = ctx.g.append("g");
  ctx.gPoints = ctx.g.append("g");
  ctx.gTools = ctx.g.append("g").attr("id", "toolG");

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
    })
    .filter(function(event) {
      return ctx.selected_tool == "move";
    }); // pour éviter les interférences entre les events lies aux outils et ceux aux zooms

  // Enable zoom/pan with mouse
  ctx.svg.call(ctx.zoom);

  // Zoom buttons (+ / -)
  setupZoomButtons();
  setupTools();
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

function setupTools() {
  
  const moveBtn = d3.select("#move");
  const rectBtn = d3.select("#rectangle");
  const freeBtn = d3.select("#free");

  moveBtn.on("click", function() {
    ctx.selected_tool = "move";
    moveBtn.attr("aria-pressed", "true");
    rectBtn.attr("aria-pressed", "false");
    freeBtn.attr("aria-pressed", "false");

    console.log("move");
    ctx.gTools.on("mousedown", null)
              .on("mouseup", null);
    

  })

  rectBtn.on("click", function() {
    ctx.selected_tool = "rect";
    moveBtn.attr("aria-pressed", "false");
    rectBtn.attr("aria-pressed", "true");
    freeBtn.attr("aria-pressed", "false");

    console.log("rect");
    ctx.gTools.on("mousedown", mouseDownRect)
              .on("mouseup", mouseUpRect);
  })

  freeBtn.on("click", function() {
    ctx.selected_tool = "free";
    moveBtn.attr("aria-pressed", "false");
    rectBtn.attr("aria-pressed", "false");
    freeBtn.attr("aria-pressed", "true");

    console.log("free");

    ctx.gTools.on("mousedown", mouseDownFree)
              .on("mouseup", mouseUpFree);

  })

  ctx.lineGenerator = d3.line().x(d => d[0])
                               .y(d => d[1]);

  ctx.pathPoints = [];
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

  // add a rectangle object to recieve clicks
 
  d3.select("g#toolG").append("rect")
                      .attr("x", x0)
                      .attr("y", y0)
                      .attr("width", x1-x0)
                      .attr("height", y1-y0)
                      .attr("id", "toolrect")
                      .attr("fill", "rgba(100,0,0,0.0)");

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


// fonctions de contrôle des outils




function mouseDownFree() {
    console.log("freeeedoooom")

    ctx.pathPoints = [d3.pointer(event, this)]; // adding first point of path
    
    ctx.gTools.append("path").attr("d", ctx.lineGenerator(ctx.pathPoints))
                      .style("stroke", "lightblue")
                      .style("fill", "lightblue")
                      .attr("opacity", 0.5)
                      .attr("id", "currentfree");

    ctx.gTools.on("mousemove", mouseMoveFree);
}

function mouseMoveFree() {
    console.log("nyoom")

    ctx.pathPoints.push(d3.pointer(event, this));
    d3.select("path#currentfree").attr("d", ctx.lineGenerator(ctx.pathPoints));
}

function mouseUpFree() {

  console.log("free mouseup !!");
  ctx.gTools.on("mousemove", null);

  let path = d3.select("path#currentfree");
  path.attr("d", path.attr("d") + "Z") //close the path when mouse is released
  bboxToView(path.node().getBBox());

  // do stuff to choose the studies to display, call function to draw the graphs

  path.remove();
}


function mouseDownRect() {
    console.log("starting rectangular selection");
    ctx.startingPoint = d3.pointer(event, this);
    
    ctx.rectangle = ctx.gTools.append("rect")
                                  .attr("x", ctx.startingPoint[0])
                                  .attr("y", ctx.startingPoint[1])
                                  .attr("height", 0) 
                                  .attr("width", 0)
                                  .attr("id", "currentrect")
                                  .style("fill", "lightblue")
                                  .style("opacity", 0.5);

    ctx.gTools.on("mousemove", mouseMoveRect);
}

function mouseMoveRect() {
    let mouse = d3.pointer(event, this);

    let width = mouse[0] - ctx.startingPoint[0];
    let height = mouse[1] - ctx.startingPoint[1];

    ctx.rectangle.attr("x", Math.min(mouse[0], ctx.startingPoint[0]))
             .attr("y", Math.min(mouse[1], ctx.startingPoint[1]))
             .attr("width", Math.abs(width))
             .attr("height", Math.abs(height));
}

function mouseUpRect() {
    console.log("rect mouseup")
    ctx.gTools.on("mousemove", null);
    let rect = d3.select("rect#currentrect");    
    bboxToView(rect.node().getBBox());
    rect.remove();
}


function bboxToView(bbox) {
    //updates the view to fit to the bounding box

    console.log(bbox);
    ctx.tempProj = ctx.proj;

    const scaleFactor = Math.min((ctx.WIDTH * 0.9) / bbox.width,
                                 (ctx.HEIGHT * 0.9) / bbox.height)
    
    const xTranslation = ctx.WIDTH / 2 - scaleFactor * (bbox.x + bbox.width/2) 
    const yTranslation = ctx.HEIGHT / 2 - scaleFactor * (bbox.y + bbox.height/2)

    const focus = d3.zoomIdentity.translate(xTranslation, yTranslation)
                                 .scale(scaleFactor);

    ctx.svg.transition()
           .duration(300)
           .call(ctx.zoom.transform, focus)   
}
