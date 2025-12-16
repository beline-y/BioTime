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
  selected_tool:"move",

  phyloRows: null,
  phyloSelected: null,

  // Éléments Page 3 (Détail)
  svgDetail: null,
  gDetail: null,
  gMeasurements: null,
  projectionDetail: null,
  pathDetail: null,
  tooltipDetail: null,
  playInterval: null,
  zoomDetail: null,

  availableStudyIds: [],
  studyFiles: [],
  measurementsCache: {}
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

  //Tooltip detail page 3
  ctx.tooltipDetail = d3.select("body").append("div")
    .attr("id", "tooltip-detail")
    .attr("class", "tooltip") // On réutilise la classe CSS existante pour le style
    .style("position", "absolute")
    .style("pointer-events", "none")
    .style("opacity", 0)
    .style("z-index", 1000);

  ctx.svg = container.append("svg")
    .attr("width", ctx.WIDTH)
    .attr("height", ctx.HEIGHT)
    .style("display", "block");

  // Group container (will be zoomed)
  ctx.g = ctx.svg.append("g").attr("id", "transformG");
  
  ctx.gMap = ctx.g.append("g");
  
  ctx.gTools = ctx.g.append("g").attr("id", "toolG");
  ctx.gPoints = ctx.g.append("g");

  ctx.overlay = container.append("div"); //overlay group to display selection details
  
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
        .attr("d", d => {
      const id = +d.study_id;

      if (ctx.availableStudyIds.includes(id)) {
        return d3.symbol()
          .type(d3.symbolCircle)
          .size(ctx.BASE_SYMBOL_SIZE/k)();
      } else {
        return d3.symbol()
          .type(d3.symbolCross)
          .size(ctx.BASE_SYMBOL_SIZE/k)();
      }
    })
        .attr("stroke-width", 0.4/(0.5*k));
    })
  
   .filter(function(event) {
      return ctx.selected_tool == "move";
    }); // pour éviter les interférences entre les events lies aux outils et ceux aux zooms
  
  // enable zoom/pan with mouse and block page scroll
  ctx.svg.call(ctx.zoom);
  ctx.svg.on("wheel", event =>{event.preventDefault()}, {passive:false});
  
  // Zoom buttons (+ / -)
  setupZoomButtons();
  setupTools();
  setupSelectionFigures();
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
  const zoomResetBtn = d3.select("#zoom-reset")

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

  zoomResetBtn.on("click", function () {
    ctx.svg
      .transition()
      .duration(300)
      .call(
        ctx.zoom.transform,
        d3.zoomIdentity
      );
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

function setupSelectionFigures() {
  // setting up container div                                         
  ctx.overlay.attr("id", "overlay-container")
  ctx.overlay.style("width", (0.33 * ctx.WIDTH) + "px") 
             .style("height", (0.9 * ctx.HEIGHT) + "px")
             .style("position", "absolute")
             .style("overflow", "hidden")
             .style("transform", `translateX(${ctx.WIDTH}px)`)
             .style("right", `10px`)
             .style("top", `${0.05 * ctx.HEIGHT}px`);

  //adding button similar to close buttons                                        
  button = ctx.overlay.append("div")
  button.attr("class", "tool-btn")
        .attr("id", "close")
  button.style("position", "absolute")
        .style("top", "0px")
        .style("left", "0px");
        
  button.append("img").attr("src", "..//icons//close_icon_64px.png")
                      .attr("width", "25px");

  button.on("click", closeSelectionFigures);
                                                    

  let sideWin = ctx.overlay.append("svg").attr("width", 0.33 * ctx.WIDTH)
                                         .attr("height", 0.9 * ctx.HEIGHT);
  sideWin.style("display", "block")
         .style("position", "right");
                                        
  ctx.sideSVG1 = sideWin.append("svg");
  ctx.sideSVG1.attr("id","sidesvg1")
              .attr("x", 48)
              .attr("y", 0)
              .attr("width", sideWin.attr("width") - 48)
              .attr("height", 0.48 * sideWin.attr("height"));
  ctx.sideG1 = ctx.sideSVG1.append("g");

  ctx.sideSVG1.append("rect").attr("x", 0)
                             .attr("y", 0)
                             .attr("width", sideWin.attr("width") - 48)
                             .attr("height", 0.48 * sideWin.attr("height"))
                             .attr("fill", "white")
                             .attr("rx", 16)
                             .attr("ry", 16);

  

  ctx.sideSVG2 = sideWin.append("svg");
  ctx.sideSVG2.attr("id","sidesvg2")
              .attr("x", 48)
              .attr("y", 0.5 * sideWin.attr("height"))
              .attr("width", sideWin.attr("width") - 48)
              .attr("height", 0.48 * sideWin.attr("height"));
  ctx.sideG2 = ctx.sideSVG2.append("g");

  ctx.sideSVG2.append("rect").attr("x", 0)
                             .attr("y", 0)
                             .attr("width", sideWin.attr("width") - 48)
                             .attr("height", 0.48 * sideWin.attr("height"))
                             .attr("fill", "white")
                             .attr("rx", 16)
                             .attr("ry", 16);

}

// Load world + studies
function loadData() {
  Promise.all([
    d3.json("../data/world-110m.json"),
    d3.json("../data/studies.json"),
    d3.csv("../data/study_list.csv")
  ])
    .then(function (values) {
      ctx.world = values[0];
      ctx.studies = values[1];
      ctx.availableStudyIds = values[2].map(d => +d.STUDY_ID);
      ctx.studyFiles = values[2];
      console.log(ctx.studies)

      drawBaseMap();
      setupFilterListeners();
      updatePoints();
      createPhyloTreemap();
      createStudyTimeline(ctx.studies)

      //page 3 
      initPage3();

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
  const prot = String(d.protected_area).toUpperCase() === "TRUE" ? "Yes" : "No";

  ctx.tooltip
    .style("opacity", 1)
    .html(`
      <div class="tt-title">Study ${d.study_id}</div>

      <div class="tt-row"><span class="tt-k">Realm</span><span class="tt-v">${d.realm}</span></div>
      <div class="tt-row"><span class="tt-k">Taxa</span><span class="tt-v">${d.taxa}</span></div>
      <div class="tt-row"><span class="tt-k">Habitat</span><span class="tt-v">${d.habitat}</span></div>
      <div class="tt-row"><span class="tt-k">Years</span><span class="tt-v">${d.start_year}–${d.end_year}</span></div>
      <div class="tt-row"><span class="tt-k">Protected</span><span class="tt-v">${prot}</span></div>
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
    .attr("d", d => {
      const id = +d.study_id;

      if (ctx.availableStudyIds.includes(id)) {
        return d3.symbol()
          .type(d3.symbolCircle)
          .size(ctx.BASE_SYMBOL_SIZE)();
      } else {
        return d3.symbol()
          .type(d3.symbolCross)
          .size(ctx.BASE_SYMBOL_SIZE)();
      }
    })
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
      console.log("Study clicked:", d);
      updateStudySelection(d.study_id);

      // scroll vers la page Studies
      document
        .getElementById("page-3")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

  // ENTER + UPDATE: positionner correctement
  entered.merge(points)
  .attr("d", d => {
      const id = +d.study_id;

      if (ctx.availableStudyIds.includes(id)) {
        return d3.symbol()
          .type(d3.symbolCircle)
          .size(ctx.BASE_SYMBOL_SIZE)();
      } else {
        return d3.symbol()
          .type(d3.symbolCross)
          .size(ctx.BASE_SYMBOL_SIZE)();
      }
    })
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

    if (currentIdx === order.length - 1) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
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

    //Sidebar page 3
    const isMapPage = visible.target.id === "page-map";
    const isStudyPage = visible.target.id === "page-3";
    const isOverviewPage = visible.target.id === "page-2";

    const arrowBtn = document.getElementById("next-page-btn");
    if (arrowBtn) {
      arrowBtn.textContent =
        visible.target.id === "page-3" ? "↑" : "↓";
    }

    d3.selectAll(".overview-only").style("display", isOverviewPage ? "flex" : "none");
    // Toggle des classes pour cacher/montrer les éléments
    document.body.classList.toggle("map-filters-hidden", !isMapPage);
    // Affichage conditionnel des éléments de la sidebar
    d3.selectAll(".map-only").style("display", isMapPage ? "flex" : "none");
    d3.select("#study-details-aside").style("display", isStudyPage ? "flex" : "none");
    d3.select("#year-slider-container").style("display", isStudyPage ? "flex" : "none");
    d3.select("#study-chart-container").style("display", isStudyPage ? "flex" : "none");

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
    d3.select("g#toolG").selectAll("path#currentfree").remove() //safeguard for when there is an issue with mouseup
    
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
  let bbox = path.node().getBBox();
  bboxToView(bbox, 0.6);
   
  recolorPoints(path); // to make the selected points change color

  ctx.sideG1.transition()
              .duration(200)
              .remove(); // clear the previous graph
    
  ctx.sideG1 = ctx.sideSVG1.append("g");

  drawSideGraph(path);
  path.remove();
}


function mouseDownRect() {
    console.log("starting rectangular selection");
    
    d3.select("g#toolG").selectAll("rect#currentrect").remove() //safeguard for when there is an issue with mouseup
    
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
    let bbox = rect.node().getBBox()
    
    bboxToView(bbox, 0.6);
        
    recolorPoints(rect); // to make the selected points change color

    ctx.sideG1.transition()
              .duration(200)
              .remove(); // clear the previous graph
    
    ctx.sideG1 = ctx.sideSVG1.append("g");
    drawSideGraph(rect);

    rect.remove();
}


function bboxToView(bbox, ratio) {
    //updates the view to fit 60% of the screen to the bounding box in the leftmost ratio of the svg
    //ctx.lastFocusedBbox = bbox;
    console.log("bbox to view", bbox);
    ctx.tempProj = ctx.proj;

    const scaleFactor = Math.min((ctx.WIDTH * 0.6) / bbox.width,
                                 (ctx.HEIGHT * 0.9) / bbox.height, 
                                 ctx.zoom.scaleExtent()[1]) // avoid zooming too much
    
    const xTranslation = 0.5 * ratio * ctx.WIDTH - scaleFactor * (bbox.x + bbox.width*0.5) 
    const yTranslation = 0.5 * ctx.HEIGHT - scaleFactor * (bbox.y + bbox.height*0.5)

    const focus = d3.zoomIdentity.translate(xTranslation, yTranslation)
                                 .scale(scaleFactor);

    ctx.svg.transition()
           .duration(300)
           .call(ctx.zoom.transform, focus)
}

function recolorPoints(shape){
  const colorScale = d3.scaleLinear().domain([minDuration, maxDuration]).range(["lightblue", "darkblue"]);
  const colorScale2 = d3.scaleLinear().domain([minDuration, maxDuration]).range(["lightgreen", "darkgreen"]);
  
  ctx.gPoints.selectAll("path.study")
             .attr("fill", function(d){
              let point = ctx.projection([d.lon, d.lat])
              if ((shape != null) && (shape.node().isPointInFill({x:point[0], y:point[1]}))) {
                return colorScale2(d.duration)
              } 
              else {return colorScale(d.duration)}
            })
}

function drawSideGraph(shape) {

  //test if points are inside the drawn selection
  function selectionFilter(coordinates) {
    point = ctx.projection(coordinates)
    return shape.node().isPointInFill({x:point[0], y:point[1]})
  }

  // show side graphs as as map overlay
  ctx.overlay.transition().duration(200)
                          .style("transform", "translateX(0px)");
  const height = ctx.sideSVG1.attr("height");
  const width = ctx.sideSVG1.attr("width");
  ctx.sideG1.append("text")
              .attr("x", width/2)
              .attr("y", height/2)
              .attr("text-anchor", "middle")
              .attr("dominant-baseline", "middle")
              .text("Loading...");

  ctx.sideG1.transition().duration(200).attr("opacity", 1) //show loading text

  
  zoneData = d3.filter(applyFilters(), (d) => selectionFilter([d.lon, d.lat]) );
  console.log("studies selected:", zoneData.length);



  zoneData = d3.filter(zoneData, (d) => d.abundance_type == "Count")
  
  let graphData = [];
  
  // prepare relevant measurement files for loading
  // zoneData.forEach(function(d) {
  //   promises.push(loadStudyMeasurements(d.study_id))
  // })
  const promises = zoneData.map((study) => {return loadStudyMeasurements(study.study_id)});

  // console.log("promises", promises);

  //load and build graphData
  Promise.allSettled(promises)
        .then(function(studies){ // studies is actually all the promises results

          studies.forEach(function(result){
            
            if(result.status == "fulfilled"){ // if there were files to load
              
              let measurements = result.value;
              //console.log("measurements", measurements);

              measurements.forEach(function(m){
                graphData.push({
                  study_id: m.STUDY_ID,
                  realm: zoneData.find((e) => e.study_id == m.STUDY_ID).realm,
                  abundance: m.ABUNDANCE,
                  year: m.YEAR
              })
            })
            }
            
          })
          //console.log("graphData", graphData);
          ctx.sideG1.transition().duration(200).attr("opacity", 0) //hide loading text
          drawSidePlot(graphData)
        })
}

function drawSidePlot(data) {

  const margin = { top: 28, right: 16, bottom: 26, left: 50 };
  
  const height = ctx.sideSVG1.attr("height");
  const width = ctx.sideSVG1.attr("width");
  
  if(data.length == 0) {
    ctx.sideG1.select("text")
              .text("No abundance data to show on selected studies");
    ctx.sideG1.transition().duration(200).attr("opacity", 1)
    return
  }

  else {
    ctx.sideG1.select("text")
              .text("");
  }

  const minYear = d3.min(data, d => d.year);
  const maxYear = d3.max(data, d => d.year);
  const years = d3.range(minYear, maxYear + 1);

  const realms = ["Marine", "Terrestrial", "Freshwater", "Unknown"]
    .filter(r => data.some(s => s.realm === r));

  const rows = years.map(y => {
    const row = { year: y };
    for (const r of realms) row[r] = 0;
    for (const s of data) {
      if (s.year == y) row[s.realm] = (row[s.realm] || 0) + 1;
    }
    return row;
  });

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

  ctx.sideG1.attr("opacity", 0)
  ctx.sideG1.append("g")
    .selectAll("path")
    .data(series)
    .enter()
    .append("path")
    .attr("d", area)
    .attr("fill", d => color(d.key))
    .attr("opacity", 0.65);

  ctx.sideG1.append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).ticks(6).tickFormat(d3.format("d")))
    .call(g => g.selectAll("text").style("font-size", "10px"));

  ctx.sideG1.append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(4))
    .call(g => g.selectAll("text").style("font-size", "10px"))
    .call(g => g.select(".domain").attr("opacity", 1));

  ctx.sideG1.append("text")
    .attr("x", margin.left)
    .attr("y", 18)
    .style("font-size", "13px")
    .style("font-weight", 800)
    .style("fill", "rgba(15,23,42,0.9)")
    .text("Measurements per year (stacked by realm)");

  const leg = ctx.sideG1.append("g")
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

  ctx.sideG1.transition().duration(100).attr("opacity", 1)
}

function closeSelectionFigures() {
  ctx.overlay.transition().duration(200)
                          .style("transform", `translateX(${ctx.WIDTH}px)`);
  
  recolorPoints(null);
  const currentZoom = d3.zoomTransform(ctx.svg.node())
  ctx.svg
      .transition()
      .duration(300)
      .call(ctx.zoom.translateBy, 0.165 * ctx.WIDTH / currentZoom.k ,0);

  //bboxToView(ctx.lastFocusedBbox, 1) // set the view to focus the last selection in the middle of the screen
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
  const width = Math.floor(nodeEl.getBoundingClientRect().width || 900);
  const height = 580;
  const titleH = 25;

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

  function render(rows) {
    // 1) build full root
    const full = d3.stratify()
      .id(d => d.Code)
      .parentId(d => d.Parent)(rows);

    full.eachBefore(d => {
      d.data.id = d.data.Code
        .replaceAll(">", "_")
        .replaceAll("|", "_")
        .replaceAll(/[^\w\-]/g, "");
    });

    full.sum(d => d.Amount || 0);

    // 2) domains = enfants directs du root
    const domains = (full.children || []).map(ch => ch.data.Description || ch.id);

    // init sélection = tout coché
    if (!ctx.phyloSelected) ctx.phyloSelected = new Set(domains);

    // 3) construire la checklist (si elle existe dans la sidebar)
    const list = d3.select("#phylo-domain-list");
    if (!list.empty()) {
      list.selectAll("*").remove();

      const items = list.selectAll("label")
        .data(domains, d => d)
        .enter()
        .append("label")
        .attr("class", "check-item");

      items.append("input")
        .attr("type", "checkbox")
        .property("checked", d => ctx.phyloSelected.has(d))
        .on("change", function(event, d) {
          if (this.checked) ctx.phyloSelected.add(d);
          else ctx.phyloSelected.delete(d);
          createPhyloTreemap(); // rerender
          requestAnimationFrame(() => window.scrollTo(0, y));
        });

      items.append("span").text(d => d);

      d3.select("#phylo-select-all").on("click", () => {
        ctx.phyloSelected = new Set(domains);
        createPhyloTreemap();
      });
    }

    // 4) “root filtré” ultra simple :
    // on copie le root et on garde seulement les enfants cochés.
    const root = full.copy();
    root.children = (root.children || []).filter(ch => {
      const name = ch.data.Description || ch.id;
      return ctx.phyloSelected.has(name);
    });
    root.sum(d => d.Amount || 0);

    // 5) treemap + draw (tu peux garder ton code actuel quasi tel quel)
    const treemap = d3.treemap()
      .tile(tileByDepth)
      .size([width, height - titleH])
      .paddingInner(3)
      .paddingOuter(25);

    treemap(root);

    const gTreemap = svg.append("g")
      .attr("transform", `translate(0, ${titleH})`);

    const nodes = gTreemap.selectAll("g.node")
      .data(root.descendants())
      .enter()
      .append("g")
      .attr("class", d => `node ${d.children ? "internal" : "leaf"}`)
      .attr("transform", d => `translate(${d.x0},${d.y0})`);

    // couleurs par domaine (= enfant depth=1)
    function domainOf(d) {
      const a = d.ancestors().reverse();
      return a[1] ? (a[1].data.Description || a[1].id) : "root";
    }
    const color = d3.scaleOrdinal()
      .domain(domains)
      .range(d3.schemeTableau10.concat(d3.schemeSet3));

    nodes.append("rect")
      .attr("id", d => d.data.id)
      .attr("width", d => Math.max(0, d.x1 - d.x0))
      .attr("height", d => Math.max(0, d.y1 - d.y0))
      .attr("rx", d => d.children ? 12 : 14)
      .attr("fill", d => {
        const c = d3.color(color(domainOf(d)));
        return d.children ? c.copy({ opacity: 0.18 }) : c.copy({ opacity: 0.45 });
      })
      .attr("stroke", d => {
        const c = d3.color(color(domainOf(d)));
        return c ? c.copy({ opacity: 0.55 }) : "rgba(15, 23, 42, 0.25)";
      })
      .append("title")
      .text(d => `${(d.data.Description || d.id)} : ${d.value}`);

    // labels : garde simple
    nodes.filter(d => d.children)
      .append("text")
      .attr("x", 8).attr("y", 16)
      .style("font-size", "12px")
      .style("font-weight", 800)
      .style("fill", "rgba(15, 23, 42, 0.80)")
      .style("pointer-events", "none")
      .text(d => d.data.Description)
      .attr("display", d => ((d.x1 - d.x0) >= 90 && (d.y1 - d.y0) >= 26) ? null : "none");

    nodes.filter(d => !d.children)
      .append("text")
      .attr("x", 8).attr("y", 18)
      .style("font-size", "11px")
      .style("font-weight", 700)
      .style("fill", "rgba(15, 23, 42, 0.85)")
      .style("pointer-events", "none")
      .text(d => truncateLabel(d.data.Description || "", d));

      nodes.filter(d => !d.children)
      .append("text")
      
      .attr("x", 8)
      .attr("y", 30)
      .style("font-size", "11px")
      .style("fill", "rgba(15, 23, 42, 0.55)")
      .style("pointer-events", "none")
      .text(d => d.value)
      ;
  }

  // charge une fois puis rerender
  if (ctx.phyloRows) render(ctx.phyloRows);
  else d3.json("../data/organism_groups_phylo_rows.json").then(rows => {
    ctx.phyloRows = rows;
    render(rows);
  });
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

function drawStudyPageMap() {
    const container = d3.select("#map-container-page3");
    const width = container.node().getBoundingClientRect().width || 600;
    const height = 400;

    const svg = container.append("svg")
        .attr("width", width)
        .attr("height", height);

    ctx.projection3 = d3.geoMercator()
        .scale(width / 6.5)
        .translate([width / 2, height / 1.5]);

    const path3 = d3.geoPath().projection(ctx.projection3);
    const g = svg.append("g");
    
    // Dessin du fond de carte (exactement la même couleur)
    const land = topojson.feature(ctx.world, ctx.world.objects.countries);
    g.append("path")
        .datum(land)
        .attr("d", path3)
        .attr("fill", "#e0dbe7ff") // Même couleur que page 1
        .attr("stroke", "#aaa")
        .attr("stroke-width", 0.5);

    // Dessin des points
    ctx.gPoints3 = g.append("g");
    
    const minDuration = d3.min(ctx.studies, d => d.duration);
    const maxDuration = d3.max(ctx.studies, d => d.duration);
    const colorScale = d3.scaleLinear().domain([minDuration, maxDuration]).range(["lightblue", "darkblue"]);

    ctx.gPoints3.selectAll("circle")
        .data(ctx.studies)
        .enter()
        .append("circle")
        .attr("class", "study-dot-p3")
        .attr("cx", d => ctx.projection3([d.lon, d.lat])[0])
        .attr("cy", d => ctx.projection3([d.lon, d.lat])[1])
        .attr("r", 3)
        .attr("fill", d => colorScale(d.duration))
        .attr("stroke", "#333")
        .attr("stroke-width", 0.2)
        .attr("id", d => "dot-" + d.study_id);
}

function populateStudySelector() {
    const selector = d3.select("#study-selector");
    
    // On trie les études par ID pour s'y retrouver
    const sortedStudies = [...ctx.studies].sort((a,b) => a.study_id - b.study_id);

    selector.selectAll("option.study-opt")
        .data(sortedStudies)
        .enter()
        .append("option")
        .attr("value", d => d.study_id)
        .text(d => `Study ${d.study_id} - ${d.realm}`);

    selector.on("change", function() {
        const selectedId = d3.select(this).property("value");
        const studyData = ctx.studies.find(d => d.study_id == selectedId);
        displayStudyDetails(studyData);
    });
}

function displayStudyDetails(d) {
    if(!d) return;

    const sidebar = d3.select("#study-info-sidebar");
    
    sidebar.html(`
        <div class="detail-grid" style="margin-top: 15px; display: grid; grid-template-columns: 1fr; gap: 8px; font-size: 0.9em;">
            <div class="detail-item" style="background: rgba(77, 160, 160, 0.1); padding: 8px; border-radius: 8px;">
                <strong style="color: #4da0a0;">Species count:</strong> ${d.number_species || 'N/A'}
            </div>
            <div class="detail-item" style="background: rgba(77, 160, 160, 0.1); padding: 8px; border-radius: 8px;">
                <strong style="color: #4da0a0;">Total samples:</strong> ${d.number_samples || 'N/A'}
            </div>
            
            <hr style="border: 0; border-top: 1px solid #eee; margin: 5px 0;">

            <div class="detail-item"><strong>Realm:</strong> ${d.realm} </div>
            <div class="detail-item"><strong>Duration:</strong> ${d.duration} years</div>
            <div class="detail-item"><strong>Years:</strong> ${d.start_year} – ${d.end_year}</div>
            <div class="detail-item"><strong>Taxa:</strong> ${d.taxa || 'N/A'}</div>
            
            <div class="detail-item" style="border-left: 3px solid #4da0a0; padding-left: 8px; background: rgba(0, 160, 160, 0.05);">
                <strong>Abundance meaning:</strong> 
                <span style="color: #6a7c8a; font-style: italic;">
                    ${d.abundance_type || 'Count of individuals'}
                </span>
            </div>
            <div class="detail-item"><strong>Protected area:</strong> ${d.protected_area === "TRUE" ? "✅ Yes" : "❌ No"}</div>
        </div>
        <div class="detail-footer" style="margin-top: 15px; font-size: 0.8em; color: #666; border-top: 1px solid #eee; padding-top: 10px;">
            <strong>Location:</strong> Lat ${d.lat.toFixed(2)}, Lon ${d.lon.toFixed(2)}
        </div>
    `);
}

function initPage3() {
    const container = d3.select("#map-container-p3");
    if (container.empty()) return;
    container.selectAll("svg").remove(); 

    const width = container.node().getBoundingClientRect().width || 800;
    const height = 500;

    ctx.svgDetail = container.append("svg")
        .attr("width", width)
        .attr("height", height)
        .attr("class", "map-svg-p3")
        .style("background", "#030924") // Couleur fixe pour éviter les dégradés qui bougent
        .style("border-radius", "18px");

    const gMain = ctx.svgDetail.append("g").attr("id", "zoom-group");
    ctx.gDetail = gMain.append("g").attr("id", "map-layer");
    ctx.gMeasurements = gMain.append("g").attr("id", "measurements-layer");

    ctx.projectionDetail = d3.geoMercator()
        .scale(width / 6.5)
        .translate([width / 2, height / 1.5]);

    ctx.pathDetail = d3.geoPath().projection(ctx.projectionDetail);

    // --- CALCUL DES LIMITES (BORDS DE CARTE) ---
    const land = topojson.feature(ctx.world, ctx.world.objects.countries);
    const [[x0, y0], [x1, y1]] = ctx.pathDetail.bounds(land);

    ctx.zoomDetail = d3.zoom()
      .scaleExtent([1, 1000])
      // Empêche de sortir des limites du monde calculées ci-dessus
      .translateExtent([[x0, y0], [x1, y1]]) 
      .on("zoom", (event) => {
        gMain.attr("transform", event.transform);
        const k = event.transform.k;
        updateDetailedPointsPosition(k);
        ctx.gDetail.selectAll("path").attr("stroke-width", 0.5 / k);
      });

    ctx.svgDetail.call(ctx.zoomDetail);
    ctx.svgDetail.on("wheel", event =>{event.preventDefault()}, {passive:false});
  
    
    // Dessin du fond de carte
    ctx.gDetail.append("path")
        .datum(land)
        .attr("class", "land-p3")
        .attr("d", ctx.pathDetail)
        .attr("fill", "#e0dbe7ff")
        .attr("stroke", "#aaa")
        .attr("stroke-width", 0.5);

    setupStudySelector();
    setupZoomButtonsP3();
    setupYearSlider();
}

// function renderSecondMap() {
//   const container = d3.select("#map-container-p3");
//   if (container.empty()) return;

//   // Filtrer les données pour ne garder que celles du CSV
//   const filteredData = ctx.studies.filter(d => ctx.availableStudyIds.includes(+d.study_id));
//   console.log("length filtered data:", filteredData.length);

//   const width = container.node().getBoundingClientRect().width || 800;
//   const height = 500;

//   const svg3 = container.append("svg")
//     .attr("width", width)
//     .attr("height", height)
//     .attr("class", "map-svg-p3")
//     .style("background", "radial-gradient(circle at top, #29407b 0, #030924 60%)")
//     .style("border-radius", "18px");

//   const projection3 = d3.geoMercator()
//     .scale(width / 6.5)
//     .translate([width / 2, height / 1.5]);

//   const path3 = d3.geoPath().projection(projection3);
//   const g = svg3.append("g");

//   // Fond de carte
//   g.append("path")
//     .datum(topojson.feature(ctx.world, ctx.world.objects.countries))
//     .attr("d", path3)
//     .attr("fill", "#e0dbe7ff")
//     .attr("stroke", "#aaa");

//   const minDur = d3.min(ctx.studies, d => d.duration);
//   const maxDur = d3.max(ctx.studies, d => d.duration);
//   const colorScale = d3.scaleLinear().domain([minDur, maxDur]).range(["lightblue", "darkblue"]);

//   // On n'affiche QUE les points disponibles dans le CSV
//   g.append("g")
//     .selectAll("circle")
//     .data(filteredData) 
//     .enter()
//     .append("circle")
//     .attr("class", "dot-p3")
//     .attr("id", d => "p3-dot-" + d.study_id)
//     .attr("cx", d => projection3([d.lon, d.lat])[0])
//     .attr("cy", d => projection3([d.lon, d.lat])[1])
//     .attr("r", 2) 
//     .attr("fill", d => colorScale(d.duration))
//     .attr("stroke", "white")
//     .attr("stroke-width", 1)
//     .on("click", (event, d) => updateStudySelection(d.study_id));
// }

function setupStudySelector() {
  const selector = d3.select("#study-selector");
  
  // Filtrer et trier les études
  const availableData = ctx.studies
    .filter(d => ctx.availableStudyIds.includes(+d.study_id))
    .sort((a, b) => a.study_id - b.study_id);

  selector.selectAll("option.opt")
    .data(availableData)
    .enter()
    .append("option")
    .attr("value", d => d.study_id)
    .text(d => `Study ${d.study_id}`);

  selector.on("change", function() {
    updateStudySelection(this.value);
  });
}

function updateStudySelection(studyId) {
  stopPlay(); // On arrête l'animation si on change d'étude
  const idNum = +studyId;
  const d = ctx.studies.find(s => +s.study_id === idNum);
  const fileInfo = ctx.studyFiles.find(f => +f.STUDY_ID === idNum);
  
  if (!d || !fileInfo) return;

  d3.select("#study-selector").property("value", studyId);
  displayStudyDetails(d);

  loadStudyMeasurements(studyId).then(measurements => {
    const years = [...new Set(measurements.map(d => d.YEAR))].sort();
    const minYear = years[0];
    const maxYear = years[years.length - 1];

    // Configurer le slider
    const slider = d3.select("#year-slider");
    slider.attr("min", minYear)
          .attr("max", maxYear)
          .property("value", minYear);
    d3.select("#year-min").text(minYear);
    d3.select("#year-max").text(maxYear);
    d3.select("#current-year-display").text(minYear);
    d3.select("#year-slider-container").style("display", "block");

    createAbundanceChart(measurements);
    zoomToStudyBounds(measurements);
    renderStudyYear(measurements, minYear);
  });
}

function centerMapOnStudy(measurements) {
  if (!measurements || measurements.length === 0) return;

  const centerLon = d3.mean(measurements, d => d.LONGITUDE);
  const centerLat = d3.mean(measurements, d => d.LATITUDE);
  
  // Recentrage de la projection
  ctx.projectionDetail.center([0, centerLat]).rotate([-centerLon, 0]);
  
  // Redessiner le fond de carte
  ctx.gDetail.selectAll("path").attr("d", ctx.pathDetail);

  // Mise à jour des limites de translation (pour éviter les bandes noires)
  const land = topojson.feature(ctx.world, ctx.world.objects.countries);
  const [[bx0, by0], [bx1, by1]] = ctx.pathDetail.bounds(land);
  const width = +ctx.svgDetail.attr("width");
  ctx.zoomDetail.translateExtent([[bx0 - width, by0], [bx1 + width, by1]]);

  // Reset du zoom à l'identité
  ctx.svgDetail.call(ctx.zoomDetail.transform, d3.zoomIdentity);
}

function renderStudyYear(measurements, selectedYear) {
  if (!measurements) return;

  // 1. Filtrer les données pour l'année choisie
  const filteredData = measurements.filter(d => d.YEAR === selectedYear);
  
  // 2. Calculer l'emprise sur TOUTES les données de l'étude pour une légende stable
  const extentAbundance = d3.extent(measurements, d => d.ABUNDANCE);
  
  // --- APPEL DE LA LÉGENDE RÉTABLI ---
  updateAbundanceLegend(extentAbundance[0], extentAbundance[1]);

  // 3. Échelle de couleur logarithmique (adaptée aux données biologiques)
  const colorScaleDetail = d3.scaleLog()
    .domain([Math.max(0.1, extentAbundance[0]), extentAbundance[1]])
    //.range(["#4da0a0", "#004242"])
    .interpolate(() => d3.interpolateViridis);
    //.interpolate(d3.interpolateHcl);

  // 4. Jointure D3 pour les points
  const dots = ctx.gMeasurements.selectAll(".measure-dot")
    .data(filteredData, d => d.ID_ALL_RAW_DATA);

  dots.exit().remove();

  const dotsEnter = dots.enter()
    .append("circle")
    .attr("class", "measure-dot")
    .style("pointer-events", "all");

  // Récupération du facteur de zoom pour la taille des points
  const transform = d3.zoomTransform(ctx.svgDetail.node());
  const k = transform.k;

  dotsEnter.merge(dots)
    .attr("cx", d => ctx.projectionDetail([d.LONGITUDE, d.LATITUDE])[0])
    .attr("cy", d => ctx.projectionDetail([d.LONGITUDE, d.LATITUDE])[1])
    .attr("fill", "none")
    .attr("stroke", d => colorScaleDetail(d.ABUNDANCE))
    .attr("stroke-width", 0.5 / k)
    .attr("r", 2 / Math.sqrt(k))
    .on("mouseover", function(event, d) {
        let dateLabel = d.YEAR;
        if (d.DAY && d.MONTH) dateLabel = `${d.DAY}/${d.MONTH}/${d.YEAR}`;
        ctx.tooltipDetail.style("opacity", 1).html(`
            <div class="tt-title">${d.valid_name || "Unknown Species"}</div>
            <div class="tt-row"><span class="tt-k">Abundance</span><span class="tt-v">${d.ABUNDANCE}</span></div>
            <div class="tt-row"><span class="tt-k">Date</span><span class="tt-v">${dateLabel}</span></div>
        `);
    })
    .on("mousemove", (event) => {
        ctx.tooltipDetail.style("left", (event.pageX + 15) + "px").style("top", (event.pageY + 15) + "px");
    })
    .on("mouseout", () => ctx.tooltipDetail.style("opacity", 0));
}

//Charge les mesures spécifiques (abondances) pour une étude donnée
function loadStudyMeasurements(studyId) {
    console.log(`Chargement des mesures pour l'étude ID: ${studyId}`);
    
    // 1. Vérifier le cache
    if (ctx.measurementsCache[studyId]) {
        return Promise.resolve(ctx.measurementsCache[studyId]);
    }
    
    // 2. Trouver le chemin du fichier dans les données chargées au démarrage
    const fileInfo = ctx.studyFiles.find(f => +f.STUDY_ID === +studyId);
    
    if (!fileInfo) {
        console.error(`Aucun chemin de fichier trouvé pour l'étude ${studyId}`);
        return Promise.reject("File not found");
    }

    // 3. Charger le CSV (chemin relatif à votre dossier data)
    return d3.csv("../" + fileInfo.FILE_PATH, function(d) {
        return {
            ABUNDANCE: +d.ABUNDANCE,
            LATITUDE: +d.LATITUDE,
            LONGITUDE: +d.LONGITUDE,
            YEAR: +d.YEAR,
            MONTH: +d.MONTH,
            DAY: +d.DAY,
            valid_name: d.valid_name,
            STUDY_ID: +d.STUDY_ID,
            ID_ALL_RAW_DATA: d.ID_ALL_RAW_DATA
        };
    }).then(function(data) {
        // Filtrage des données invalides
        const studyData = data.filter(d => 
            d !== null && 
            !isNaN(d.ABUNDANCE) && 
            !isNaN(d.YEAR)
        );

        if (studyData.length === 0) {
            console.warn(`Aucune donnée valide trouvée pour l'étude ${studyId}.`);
        }
        
        // Stockage en cache et retour
        ctx.measurementsCache[studyId] = studyData;
        return studyData; 
    }).catch(function(error) {
        console.error(`Erreur CSV étude ${studyId}:`, error);
        return [];
    });
}

function setupZoomButtonsP3() {
    d3.select("#zoom-in-p3").on("click", () => {
        // scaleBy va déclencher l'événement "zoom" ci-dessus avec un k plus grand
        ctx.svgDetail.transition().duration(300).call(ctx.zoomDetail.scaleBy, 1.5);
    });
    d3.select("#zoom-out-p3").on("click", () => {
        ctx.svgDetail.transition().duration(300).call(ctx.zoomDetail.scaleBy, 1/1.5);
    });
    d3.select("#zoom-reset-p3").on("click", () => {
        ctx.svgDetail.transition().duration(500).call(ctx.zoomDetail.transform, d3.zoomIdentity);
    });
}

function setupYearSlider() {
  const slider = d3.select("#year-slider");
  const playBtn = d3.select("#play-button");

  // On attache simplement l'événement au bouton déjà présent
  playBtn.on("click", togglePlay);

  slider.on("input", function() {
    stopPlay(); // Arrête si l'utilisateur manipule manuellement
    const selectedYear = +this.value;
    updateYearUI(selectedYear);
  });
}

// Fonction utilitaire pour mettre à jour l'affichage
function updateYearUI(year) {
  d3.select("#current-year-display").text(year);
  d3.select("#year-slider").property("value", year);
  
  const currentStudyId = d3.select("#study-selector").property("value");
  const measurements = ctx.measurementsCache[currentStudyId];
  if (measurements) {
    renderStudyYear(measurements, year);
  }
}

function updateDetailedPointsPosition(k) {
    // k est le niveau de zoom. 
    // On divise l'épaisseur du trait par k pour qu'elle reste constante à l'écran.
    ctx.gMeasurements.selectAll(".measure-dot")
        .attr("r", 2 / Math.sqrt(k)) 
        .attr("stroke-width", 1 / k);
}

function updateAbundanceLegend(minVal, maxVal) {
  const legend = d3.select("#legend-abundance");

  // sécurité pour scaleLog
  const lo = Math.max(0.1, +minVal);
  const hi = Math.max(lo, +maxVal);

  // scale (même viridis que tes points)
  const colorScaleDetail = d3.scaleLog()
    .domain([lo, hi])
    .interpolate(() => d3.interpolateViridis);

  // squelette
  if (legend.selectAll("*").empty()) {
    legend.html(`
      <div class="legend-title">Abundance</div>
      <div class="legend-bar"></div>
      <div class="legend-labels">
        <span class="legend-min"></span>
        <span class="legend-max"></span>
      </div>
    `);
  }

  // labels
  legend.select(".legend-min").text(Math.round(lo * 10) / 10);
  legend.select(".legend-max").text(Math.round(hi));
  // gradient
  const steps = 40;
  const gradient = `linear-gradient(to right, ${
    d3.range(steps).map(i => {
      const t = i / (steps - 1);
      const v = lo * Math.pow(hi / lo, t); // interpolation log
      return colorScaleDetail(v);
    }).join(",")
  })`;

  legend.select(".legend-bar").style("background", gradient);
}

function togglePlay() {
  const slider = d3.select("#year-slider").node();
  if (!ctx.playInterval && +slider.value === +slider.max) {
    updateYearUI(+slider.min);
  }

  if (ctx.playInterval) {
    stopPlay();
  } else {
    startPlay();
  }
}

function startPlay() {
  const slider = d3.select("#year-slider").node();
  const playBtn = d3.select("#play-button");
  
  playBtn.html("⏸"); // Change l'icône en Pause

  ctx.playInterval = setInterval(() => {
    let current = +slider.value;
    let max = +slider.max;

    if (current < max) {
      // S'il reste des années, on avance
      updateYearUI(current + 1);
    } else {
      // Si on est à la dernière année, on arrête tout
      stopPlay();
    }
  }, 600); // Vitesse de l'animation
}

function stopPlay() {
  if (ctx.playInterval) {
    clearInterval(ctx.playInterval);
    ctx.playInterval = null;
    d3.select("#play-button").html("▶");
  }
}

function zoomToStudyBounds(measurements) {
  if (!measurements || measurements.length === 0) return;

  // Calcul des limites (Bounding Box)
  const lons = measurements.map(d => d.LONGITUDE);
  const lats = measurements.map(d => d.LATITUDE);
  
  const minLon = d3.min(lons), maxLon = d3.max(lons);
  const minLat = d3.min(lats), maxLat = d3.max(lats);
  const centerLon = (minLon + maxLon) / 2;
  const centerLat = (minLat + maxLat) / 2;

  // Recentrer la projection
  ctx.projectionDetail.center([0, centerLat]).rotate([-centerLon, 0]);
  ctx.gDetail.selectAll("path").attr("d", ctx.pathDetail);

  // Calcul auto du niveau de zoom pour que l'étude remplisse ~70% du SVG
  const pMin = ctx.projectionDetail([minLon, minLat]);
  const pMax = ctx.projectionDetail([maxLon, maxLat]);
  const dx = Math.abs(pMax[0] - pMin[0]);
  const dy = Math.abs(pMax[1] - pMin[1]);
  const width = +ctx.svgDetail.attr("width");
  const height = +ctx.svgDetail.attr("height");
  
  // Facteur d'échelle pour tenir dans la vue
  const padding = 0.7;
  const scaleFactor = padding / Math.max(dx / width, dy / height);

  // Appliquer le zoom de manière fluide
  ctx.svgDetail.transition().duration(750).call(
    ctx.zoomDetail.transform,
    d3.zoomIdentity.translate(width/2, height/2).scale(scaleFactor).translate(-((pMin[0]+pMax[0])/2), -((pMin[1]+pMax[1])/2))
  );
}

function createAbundanceChart(measurements) {
  const container = d3.select("#abundance-sparkline");
  container.selectAll("*").remove();

  const width = container.node().getBoundingClientRect().width || 240;
  const height = 60;
  const margin = {top: 5, right: 5, bottom: 20, left: 5};

  const svg = container.append("svg").attr("width", width).attr("height", height);

  const countsByYear = d3.rollups(measurements, v => v.length, d => d.YEAR).sort((a, b) => a[0] - b[0]);
  const data = countsByYear.map(d => ({year: d[0], count: d[1]}));

  const x = d3.scaleLinear().domain(d3.extent(data, d => d.year)).range([margin.left, width - margin.right]);
  const y = d3.scaleLinear().domain([0, d3.max(data, d => d.count)]).range([height - margin.bottom, margin.top]);

  const area = d3.area().x(d => x(d.year)).y0(y(0)).y1(d => y(d.count)).curve(d3.curveMonotoneX);
  svg.append("path").datum(data).attr("fill", "#4da0a0").attr("opacity", 0.3).attr("d", area);

  const line = d3.line().x(d => x(d.year)).y(d => y(d.count)).curve(d3.curveMonotoneX);
  svg.append("path").datum(data).attr("fill", "none").attr("stroke", "#4da0a0").attr("stroke-width", 2).attr("d", line);

  const yearsExtent = d3.extent(data, d => d.year);
  svg.append("text").attr("x", margin.left).attr("y", height - 5).style("font-size", "10px").style("fill", "#8899a6").text(yearsExtent[0]);
  svg.append("text").attr("x", width - margin.right).attr("y", height - 5).attr("text-anchor", "end").style("font-size", "10px").style("fill", "#8899a6").text(yearsExtent[1]);
}
