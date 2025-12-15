const ctx = {
    SVG_WIDTH: 1200,
    SVG_HEIGHT: 1200,
    TRANSITION_DURATION: 750,
    COLLAPSE_DEPTH: 2
};

const colorScale = d3.scaleOrdinal(d3.schemePastel1);

const levelRadius = {
    0: 0,
    1: 30,
    2: 70,
    3: 140,
    4: 210,
    5: 280,
    6: 350,
    7: 420
};
ctx.OUTER_RADIUS = levelRadius[Object.keys(levelRadius).length - 1];

const levelNames = {
    1: "Kingdom",
    2: "Phylum",
    3: "Class",
    4: "Order",
    5: "Family",
    6: "Genus",
    7: "Species"
};

/* ---------------- GLOBAL VARIABLES ---------------- */
let vizRoot = null;
let vizChart = null;
let dataCache = null;
let nodeParentMap = new Map();
let selectedPath = new Set();
let cluster = null;
let update = null;

/* ---------------- DATA HELPERS ---------------- */
function convertJsonToD3_2(nodeContainer, nodeName) {
    const childrenData = nodeContainer.children || {};
    const node = { name: nodeName, children: [] };
    const childNames = Object.keys(childrenData);
    if (childNames.length) {
        childNames.forEach(name => node.children.push(convertJsonToD3_2(childrenData[name], name)));
    } else {
        delete node.children;
    }
    return node;
}

function buildParentMap(root) {
    nodeParentMap.clear();
    function traverse(node, parent) {
        nodeParentMap.set(node, parent);
        if (node.children) node.children.forEach(c => traverse(c, node));
        if (node._children) node._children.forEach(c => traverse(c, node));
    }
    traverse(root, null);
}

function getPathToRoot(node) {
    const path = new Set();
    let current = node;
    while (current) {
        path.add(current);
        current = nodeParentMap.get(current);
    }
    return path;
}

function collapseBelowDepth(d, targetDepth, pathToKeepVisible = new Set()) {
    // Si pathToKeepVisible est vide, la condition est toujours fausse, ce qui est le comportement voulu.
    const mustCollapse = d.depth >= targetDepth && d.children;
    const isProtected = pathToKeepVisible.size > 0 && pathToKeepVisible.has(d);
    
    if (mustCollapse) {
        if (!isProtected) {
            d._children = d.children;
            d.children = null;
        }
    }
    if (d.children) d.children.forEach(c => collapseBelowDepth(c, targetDepth, pathToKeepVisible));
    if (d._children) d._children.forEach(c => collapseBelowDepth(c, targetDepth, pathToKeepVisible));
}

/* ---------------- VISUALIZATION HELPERS ---------------- */
function linkStep(sa, sr, ea, er) {
    const s = (sa - 90) * Math.PI / 180;
    const e = (ea - 90) * Math.PI / 180;
    return `M${sr * Math.cos(s)},${sr * Math.sin(s)}
            A${sr},${sr} 0 0 ${ea > sa ? 1 : 0}
            ${sr * Math.cos(e)},${sr * Math.sin(e)}
            L${er * Math.cos(e)},${er * Math.sin(e)}`;
}

function linkConstant(d) {
    const rSource = levelRadius[d.source.depth];
    const rTarget = levelRadius[d.target.depth];
    return linkStep(d.source.x * 180 / Math.PI, rSource, d.target.x * 180 / Math.PI, rTarget);
}

function linkExtensionConstant(d) {
    const rTarget = levelRadius[d.target.depth];
    return linkStep(d.target.x * 180 / Math.PI, rTarget, d.target.x * 180 / Math.PI, ctx.OUTER_RADIUS);
}

function clearPath() {
    if (!vizChart) return;
    vizChart.selectAll(".link").classed("link--selected", false);
    vizChart.selectAll(".link-extension").classed("link-extension--selected", false);
    vizChart.selectAll(".labels text").classed("label--selected", false);
}

function highlightPath(d) {
    clearPath();
    const path = getPathToRoot(d);
    selectedPath = path;
    path.forEach(node => {
        // Select label by data
        vizChart.selectAll(".labels text")
            .filter(d => d === node)
            .classed("label--selected", true);
        // Select link by data
        vizChart.selectAll(".links path")
            .filter(d => d.target === node)
            .classed("link--selected", true);
        // Select link extension by data
        vizChart.selectAll(".link-extensions path")
            .filter(d => d.target === node)
            .classed("link-extension--selected", true);
    });
}

/* ---------------- CREATE TREEMAP ---------------- */
function createTreemap(data) {
    const rootNode = convertJsonToD3_2({ children: data }, "");
    const root = d3.hierarchy(rootNode, d => d.children).sum(d => d.children ? 0 : 1);
    root.children?.forEach(child => child.each(d => d.data.colorGroup = child.data.name));
    let nextId = 0;
    root.each(d => d.uniqueId = d.data.name || "__temp_" + nextId++);
    vizRoot = root;
    buildParentMap(vizRoot);

    // Initial selected path
    selectedPath = getPathToRoot(vizRoot);

    // Initial collapse
    collapseBelowDepth(vizRoot, ctx.COLLAPSE_DEPTH, selectedPath);

    const chart = vizChart;

    // Cluster layout
    cluster = d3.cluster().size([360, ctx.INNER_RADIUS]).separation(() => 1);

    // Concentric circles
    const levelGroup = chart.append("g").attr("class", "level-circles");
    Object.keys(levelRadius).forEach(d => {
        const r = levelRadius[d];
        if (r > 0) {
            levelGroup.append("circle")
                .attr("r", r)
                .attr("fill", "none")
                .attr("stroke", "#e7e6e6ff")
                .attr("stroke-dasharray", "4,2")
                .attr("stroke-width", 1);
            levelGroup.append("text")
                .attr("y", -r - 4)
                .attr("text-anchor", "middle")
                .attr("fill", "#9c9b9bff")
                .attr("font-size", 12)
                .text(levelNames[d]);
        }
    });
    levelGroup.lower();

    /* -------- UPDATE FUNCTION -------- */
    update = function(source) {
        cluster(vizRoot);
        const nodes = vizRoot.descendants();
        const links = vizRoot.links();
        nodes.forEach(d => d.x *= Math.PI / 180);

        sourcePath = getPathToRoot(source);
        // LINKS
        const link = chart.select(".links").selectAll("path").data(links, d => d.target.uniqueId);
        const linkEnter = link.enter().append("path")
            .attr("class", "link")
            .attr("d", d => linkConstant({ source, target: source }))
            .attr("stroke", d => colorScale(d.target.data.colorGroup))
            .each(function(d) { d.target.data.linkNode = this; });
        link.merge(linkEnter)
            .transition().duration(ctx.TRANSITION_DURATION)
            .attr("d", linkConstant);
        link.exit().remove();

        // LINK EXTENSIONS
        const ext = chart.select(".link-extensions").selectAll("path")
            .data(links.filter(d => !d.target.children), d => d.target.uniqueId);
        const extEnter = ext.enter().append("path")
            .attr("class", "link-extension")
            .each(function(d) { d.target.data.linkExtensionNode = this; });
        ext.merge(extEnter)
            .transition().duration(ctx.TRANSITION_DURATION)
            .attr("d", linkExtensionConstant);
        ext.exit().remove();

        // NODES
        const node = chart.select(".nodes").selectAll("circle").data(nodes, d => d.uniqueId);
        const nodeEnter = node.enter().append("circle")
            .attr("r", 1e-4)
            .attr("fill", d => d.data.name ? colorScale(d.data.colorGroup) : "transparent")
            .attr("transform", `translate(${source.y},0)`)
            .on("click", click);
        node.merge(nodeEnter)
            .transition().duration(ctx.TRANSITION_DURATION)
            .attr("r", d => d.children || d._children ? 3.5 : 5)
            .attr("fill", d => d.data.name ? colorScale(d.data.colorGroup) : "transparent")
            .attr('transform', d => {
                const radius = levelRadius[d.depth];
                return `translate(${radius * Math.cos(d.x - Math.PI/2)}, ${radius * Math.sin(d.x - Math.PI/2)})`;
            });
        node.exit().remove();

        // LABELS
        const label = chart.select(".labels").selectAll("text").data(nodes, d => d.uniqueId);
        const labelEnter = label.enter().append("text")
            .attr("dy", ".31em")
            .attr("opacity", 0)
            .text(d => d.data.name ? d.data.name.replace(/_/g, " ") : "")
            .each(function(d) { d.data.labelNode = this; });
        label.merge(labelEnter)
            .transition().duration(ctx.TRANSITION_DURATION)
            .attr("opacity", d => {
                const isSelected = sourcePath.has(d);
                const isLeaf = !d.children && !d._children;
                const isCollapsed = d._children && !d.children;                // Show label if:
                return (isSelected || isLeaf || isCollapsed) ? 1 : 0;
            })
            .attr("text-anchor", d => d.x < Math.PI ? "start" : "end")
            .attr('transform', d => {
                const radius = levelRadius[d.depth] || 0;
                const angle = d.x * 180 / Math.PI;
                let rotation = angle < 180 ? angle - 90 : angle + 90;
                const tilt = d.children ? (angle < 180 ? 10 : -10) : 0;
                rotation += tilt;
                const offset = angle < 180 ? 8 : -8;
                const xPos = radius * Math.cos(d.x - Math.PI/2);
                const yPos = radius * Math.sin(d.x - Math.PI/2);
                return `translate(${xPos}, ${yPos}) rotate(${rotation}) translate(${offset})`;
            });
        label.exit().remove();

        if (source) {
            clearPath();
            highlightPath(source);
        }
    };

    // Initial render
    update(vizRoot);
}

/* ---------------- CLICK HANDLER ---------------- */
function click(event, d) {
    if (!d.data.name) return;
    if (!d.children && d._children) {
        d.children = d._children;
        d._children = null;
    } else if (d.children) {
        d._children = d.children;
        d.children = null;
    }
    update(d);

}

/* ---------------- INITIALIZE ---------------- */
function createViz() {
    const controlPanel = d3.select("#main").append("div")
        .attr("id", "control-panel")
        .style("margin-bottom", "20px");

    controlPanel.append("label").text("Collapse Below: ");
    controlPanel.append("span").attr("id", "current-depth").text(levelNames[ctx.COLLAPSE_DEPTH]);
    controlPanel.append("input")
        .attr("type", "range")
        .attr("min", 1)
        .attr("max", Object.keys(levelNames).length)
        .attr("value", ctx.COLLAPSE_DEPTH)
        .on("input", function() {
            const newDepth = +this.value;
            d3.select("#current-depth").text(levelNames[newDepth]);
            if (!vizRoot) return;
            
            // Étape 1: Expansion Totale forcée (Nettoyage de l'état)
            vizRoot.each(d => { if (d._children) { d.children = d._children; d._children = null; } });
            
            // Étape 2: Application de la nouvelle limite de profondeur SANS tenir compte du chemin sélectionné
            // Si la profondeur augmente, tout au-delà de cette profondeur est masqué.
            // Si elle diminue, rien n'est masqué par cette fonction.
            collapseBelowDepth(vizRoot, newDepth); // <-- PAS de selectedPath ici

            // Mettre à jour la variable globale
            ctx.COLLAPSE_DEPTH = newDepth; 
            
            // Étape 3: Redessiner
            update(vizRoot);
        });

    const svg = d3.select("#main").append("svg")
        .attr("width", ctx.SVG_WIDTH)
        .attr("height", ctx.SVG_HEIGHT);

    vizChart = svg.append("g")
        .attr("class", "tree-container")
        .attr("transform", `translate(${ctx.SVG_WIDTH/2}, ${ctx.SVG_HEIGHT/2})`);

    vizChart.append("g").attr("class", "link-extensions");
    vizChart.append("g").attr("class", "links");
    vizChart.append("g").attr("class", "nodes");
    vizChart.append("g").attr("class", "labels");

    const style = document.createElement("style");
    style.innerHTML = `
        #control-panel { font-family: Arial, sans-serif; color: #444; }
        .link { fill: none; stroke-opacity: 0.4; }
        .link--selected { stroke-opacity: 1; stroke-width: 2.5px; }
        .link-extension { stroke-opacity: 0.1; }
        .link-extension--selected { stroke-opacity: 0.6; }
        .labels text { font-size: 10px; fill: #222; pointer-events: none; font-family: Arial, sans-serif; }
        .label--selected { font-weight: bold; }
        `;
    document.head.appendChild(style);

    // Load JSON data
    d3.json("data/taxonomy_tree_structured.json")
        .then(data => {
            dataCache = data;
            createTreemap(data);
        })
        .catch(error => {
            console.error(error);
            const exampleData = { "Animalia": { "Chordata": { "Mammalia": { "Carnivora": { "Felidae": { "Panthera": { "Panthera leo": {}, "Panthera tigris": {} } } } } } } };
            dataCache = exampleData;
            createTreemap(exampleData);
        });
}

createViz();
