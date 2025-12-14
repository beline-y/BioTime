let projection;
let path;
let svg;
let g;
let tooltip;
let playInterval; // Variable globale pour stocker l'intervalle de lecture


const ctx = {
    width: 960,
    height : 600,
    mapMode: false,
    minCount: 2600,
};

// Variable globale pour stocker les configurations des études et les données chargées
let STUDY_CONFIG = {}; // Ceci est la variable que nous allons remplir.


function loadStudyList(listFilePath) {
    return d3.csv(listFilePath).then(function(data) {
        
        // DÉFINITION MANQUANTE : Initialiser 'config' ici !
        const config = {}; 
        
        const studySelector = d3.select("#studySelector");
        
        // 1. Vider le sélecteur existant (si déjà rempli)
        studySelector.html(""); 

        // 2. Parcourir la liste pour construire la configuration et le menu HTML
        data.forEach(d => {
            const studyId = d.STUDY_ID;
            const filePath = d.FILE_PATH; 
            const studyName = d.STUDY_NAME || `Étude ${studyId}`; 

            if (studyId && filePath) {
                config[studyId] = { // 'config' est correctement utilisé ici
                    filePath: filePath,
                    data: null,
                    name: studyName
                };
                
                // 3. Remplir le menu déroulant
                studySelector.append("option")
                    .attr("value", studyId)
                    .text(studyName);
            }
        });
        
        return config; // 'config' est maintenant accessible et retourné
    }); // N'oubliez pas le .catch si vous ne l'avez pas déjà ajouté
}

// =================================================================
// 1. Fonction loadData(studyId)
//    Charge les données si non déjà chargées, et retourne les données traitées.
// =================================================================
function loadData(studyId) {
    //console.error(`Configuration introuvable pour l'étude ID: ${studyId}`);
    console.log(`Chargement des données pour l'étude ID: ${studyId}`);
    const config = STUDY_CONFIG[studyId];
    
    // Si les données sont déjà chargées, on les retourne directement (optimisation)
    if (config.data) {
        return Promise.resolve(config.data);
    }
    
    // Sinon, on charge le fichier CSV
    return d3.csv(config.filePath, function(d) {
        return {
            ABUNDANCE: +d.ABUNDANCE,
            LATITUDE: +d.LATITUDE,
            LONGITUDE: +d.LONGITUDE,
            YEAR: +d.YEAR,
            valid_name: d.valid_name,
            STUDY_ID: +d.STUDY_ID,
            ID_ALL_RAW_DATA: d.ID_ALL_RAW_DATA
        };
        
    }).then(function(data) {
        const studyData = data.filter(d => 
            d !== null && 
            !isNaN(d.ABUNDANCE) && 
            !isNaN(d.LATITUDE) && 
            !isNaN(d.LONGITUDE)
        );

        if (studyData.length === 0) {
            console.error(`Aucune donnée valide trouvée pour l'étude ${studyId}.`);
        }
        
        // Stocker les données dans la configuration pour éviter de recharger
        config.data = studyData;
        return studyData; 
    }).catch(function(error) {
        console.error(`Erreur lors du chargement ou du traitement des données CSV de l'étude ${studyId}:`, error);
        return [];
    });
}

// =================================================================
// 2. Fonction createViz()
//    Initialise la carte et appelle loadData pour démarrer le rendu.
// =================================================================
function createViz() {
    
    // Initialisation de la projection et du chemin
    projection = d3.geoMercator()
        .scale(150)
        .center([0, 0])
        .translate([ctx.width / 2, ctx.height / 2]);
    path = d3.geoPath().projection(projection);

    // Création du SVG principal et du groupe
    svg = d3.select("#mapContainer")
        .append("svg")
        .attr("width", ctx.width)
        .attr("height", ctx.height);
    g = svg.append("g");

    // NOUVEAU: Définir et appliquer le comportement de zoom
    const zoom = d3.zoom()
        .scaleExtent([1, 12]) // Limites de zoom : de x1 à x12
        .on("zoom", function(event) {
            // Appliquer la transformation (déplacement + échelle) au groupe 'g'
            g.attr("transform", event.transform);
            
            // OPTIONNEL: Ajuster l'épaisseur des traits pour qu'elle reste visible en zoomant
            g.selectAll(".countryBorder").style("stroke-width", 0.5 / event.transform.k + "px");
            g.selectAll(".pointSample").attr("stroke-width", 1.5 / event.transform.k + "px");
        });
        
    // Appliquer le zoom au conteneur SVG
    svg.call(zoom);
    
    // Création du groupe 'g' (tout le contenu de la carte y est dessiné pour être zoomable)
    g = svg.append("g");

    // Création de l'info-bulle
    tooltip = d3.select("body").append("div")
        .attr("class", "tooltip")
        .style("opacity", 0);
    
    const mapPromise = d3.json("data/world-110m.json"); 
    const listPromise = loadStudyList("study_list.csv");

    // 2a. Chargement des données de la carte et de la liste des études
    Promise.all([mapPromise, listPromise]).then(function([world, config]) {
        STUDY_CONFIG = config;
        
        // Dessine les pays et les bordures
        g.selectAll("path")
            .data(topojson.feature(world, world.objects.countries).features)
            .enter().append("path")
            .attr("class", "countryArea")
            .attr("d", path);

        g.append("path")
            .datum(topojson.mesh(world, world.objects.countries, (a, b) => a !== b))
            .attr("class", "countryBorder")
            .attr("d", path);

        // Gestion du Sélecteur d'Étude 
        const studySelector = d3.select("#studySelector");
        
        // Fonction à exécuter lors d'un changement dans le sélecteur
        const handleStudyChange = () => {
            const selectedStudyId = studySelector.property("value");
            // Lance la fonction de rendu pour la nouvelle étude
            renderVisualization(selectedStudyId); 
        };

        // Attacher l'écouteur d'événement
        studySelector.on("change", handleStudyChange);

        // Lancer la visualisation pour l'étude sélectionnée par défaut (étude 108)
        handleStudyChange(); 

    }).catch(function(error) {
        console.error("Erreur lors du chargement des données de la carte:", error);
    });

}

// =================================================================
// 3. Nouvelle Fonction de Rendu : renderVisualization(studyId)
// =================================================================
function renderVisualization(studyId) {
    
    loadData(studyId).then(function(studyData) {
        
        if (studyData.length === 0) {
            g.selectAll(".pointSample").remove();
            d3.select("#yearLabel").text("N/A");
            return;
        }

        console.log('2. Nombre de lignes brutes chargées:', studyData.length);

        // Calcul des échelles
        const minYear = d3.min(studyData, d => d.YEAR);
        const maxYear = d3.max(studyData, d => d.YEAR);

        const sizeScale = d3.scaleSqrt()
            .domain([0, d3.max(studyData, d => d.ABUNDANCE)])
            .range([2, 5]); 

        // Échelle pour les couleurs
        colorScale = d3.scaleLinear()
            .domain([
                d3.min(studyData, d => d.ABUNDANCE) || 0, 
                d3.max(studyData, d => d.ABUNDANCE)      
            ])
            .range(["#4cbadeff", "#191970"]) 
            .interpolate(d3.interpolateHcl);
        // Dessiner la légende des couleurs
        const minAbundance = d3.min(studyData, d => d.ABUNDANCE) || 0;
        const maxAbundance = d3.max(studyData, d => d.ABUNDANCE);
        drawColorLegend(colorScale, minAbundance, maxAbundance);


        // Mise à jour du curseur (limites d'année)
        const yearSlider = d3.select("#yearSlider")
            .attr("min", minYear)
            .attr("max", maxYear)
            // Réinitialiser la valeur du curseur à l'année min de la nouvelle étude
            .attr("value", minYear) 
            .attr("step", 1)
            // L'écouteur est mis à jour pour appeler updateMap avec le nouveau contexte
            .on("input", () => updateMap(studyData, sizeScale, colorScale)); 

        // Gestion du bouton Play/Pause
        d3.select("#playButton")
            .on("click", () => playYears(studyData, sizeScale, colorScale));
        
        // IMPORTANT : Retirer tous les anciens points de l'étude précédente.
        g.selectAll(".pointSample").remove();

        // Premier rendu des points pour la nouvelle étude
        updateMap(studyData, sizeScale, colorScale);
    });
}

// =================================================================
// 4. Fonction updateMap()
//    Fonction séparée pour le rendu et l'interaction.
// =================================================================
function updateMap(studyData, sizeScale, colorScale) {
    console.log('Fonction updateMap(); lignes brutes chargées:', studyData.length);

    const selectedYear = +d3.select("#yearSlider").property("value");
    
    d3.select("#yearLabel").text(selectedYear);

    const filteredData = studyData.filter(d => 
        d.YEAR === selectedYear 
    );

    // Mise à jour des points sur la carte (Data Join)
    const paths = g.selectAll(".pointSample")
    .data(filteredData, d => d.ID_ALL_RAW_DATA);


    console.log(`Données filtrées (Total attendu) : ${filteredData.length}`);
    console.log(`Sélection 'UPDATE' (Points existants) : ${paths.size()}`);
    console.log(`Sélection 'EXIT' (Points à supprimer) : ${paths.exit().size()}`);
    console.log(`Sélection 'ENTER' (Nouveaux points) : ${paths.enter().size()}`);

    // Entrée (nouveaux points)
    paths.enter()
        .append("circle")
        .attr("class", "pointSample")
        .attr("cx", d => projection([d.LONGITUDE, d.LATITUDE])[0])
        .attr("cy", d => projection([d.LONGITUDE, d.LATITUDE])[1])
        .attr("r", 0)
        .attr("fill", "none")
        .attr("stroke", d => colorScale(d.ABUNDANCE))
        .attr("stroke-width", "1.5px")
        .merge(paths) // Optionnel mais recommandé pour fusionner enter et update
        .transition().duration(50)
        .attr("r", d => 1) // <--- AJOUTEZ CETTE LIGNE (Taille finale)
        .attr("cx", d => projection([d.LONGITUDE, d.LATITUDE])[0]) // Recalculer la position au cas où
        .attr("cy", d => projection([d.LONGITUDE, d.LATITUDE])[1])


        .on("end", function() {
            // Ajout des événements d'interaction après l'animation
            d3.select(this)
                .on("mouseover", function(event, d) {
                    tooltip.transition()
                        .duration(50)
                        .style("opacity", .9);
                    tooltip.html(`<b>Espèce:</b> ${d.valid_name}<br/><b>Année:</b> ${d.YEAR}<br/><b>Abondance:</b> ${d.ABUNDANCE}<br/><b>Lat:</b> ${d.LATITUDE.toFixed(2)}, <b>Long:</b> ${d.LONGITUDE.toFixed(2)}`)
                        .style("left", (event.pageX + 10) + "px")
                        .style("top", (event.pageY - 28) + "px");
                })
                .on("mouseout", function(d) {
                    tooltip.transition()
                        .duration(50)
                        .style("opacity", 0);
                });
        });

    // Mise à jour (points existants)
    paths.transition().duration(50)
        .attr("cx", d => projection([d.LONGITUDE, d.LATITUDE])[0])
        .attr("cy", d => projection([d.LONGITUDE, d.LATITUDE])[1])
        .attr("r", d => sizeScale(d.ABUNDANCE))
        .attr("fill", "none") 
        .attr("stroke", d => colorScale(d.ABUNDANCE));

    // Sortie (points qui disparaissent)
    paths.exit()
        .transition().duration(50)
        .attr("r", 0)
        .remove();
}


// =================================================================
// Fonction : playYears()
// Gère l'animation de lecture automatique
// =================================================================
function playYears(studyData, sizeScale, colorScale) {
    const yearSlider = d3.select("#yearSlider");
    const playButton = d3.select("#playButton");
    
    let currentYear = +yearSlider.property("value");
    const minYear = +yearSlider.attr("min");
    const maxYear = +yearSlider.attr("max");

    if (playInterval) {
        // Stop l'animation si elle est déjà en cours
        clearInterval(playInterval);
        playInterval = null;
        playButton.text("Play");
        return;
    }

    // Démarre l'animation
    playButton.text("Pause");
    
    // Si nous sommes à la fin, on recommence au début
    if (currentYear >= maxYear) {
        currentYear = minYear - 1; 
    }

    playInterval = setInterval(() => {
        currentYear++;
        if (currentYear > maxYear) {
            currentYear = minYear;
        }

        // 1. Mettre à jour le curseur
        yearSlider.property("value", currentYear);
        
        // 2. Mettre à jour la carte
        updateMap(studyData, sizeScale, colorScale);

    }, 300); // Vitesse : une année toutes les 300 millisecondes (ajustez)
}

// =================================================================
// Nouvelle Fonction : drawColorLegend(colorScale, minVal, maxVal)
// =================================================================
function drawColorLegend(colorScale, minVal, maxVal) {
    
    // Configuration de la légende
    const legendWidth = 200;
    const legendHeight = 20;
    const legendPadding = 20; // Marge par rapport au bord
    
    // Position du coin inférieur droit (bas-droite) de la carte
    const legendX = ctx.width - legendWidth - legendPadding;
    const legendY = ctx.height - legendHeight - legendPadding;

    // --- 1. Définir le Dégradé SVG (Gradient) ---
    // Supprimer l'ancien dégradé si il existe
    svg.select("#colorGradient").remove();
    
    const linearGradient = svg.append("defs")
        .append("linearGradient")
        .attr("id", "colorGradient")
        .attr("x1", "0%") // Début à gauche
        .attr("y1", "0%")
        .attr("x2", "100%") // Fin à droite
        .attr("y2", "0%");

    // Arrêts de couleur (Stops)
    // Nous allons échantillonner l'échelle colorScale pour remplir le dégradé
    linearGradient.append("stop")
        .attr("offset", "0%")
        .attr("stop-color", colorScale(minVal)); // Couleur au min

    linearGradient.append("stop")
        .attr("offset", "100%")
        .attr("stop-color", colorScale(maxVal)); // Couleur au max

    // --- 2. Dessiner le Rectangle de la Légende ---
    // Supprimer l'ancien groupe de légende
    svg.select(".legend-group").remove();
    
    const legendGroup = svg.append("g")
        .attr("class", "legend-group")
        .attr("transform", `translate(${legendX}, ${legendY})`);

    // Rectangle rempli du dégradé
    legendGroup.append("rect")
        .attr("width", legendWidth)
        .attr("height", legendHeight)
        .style("fill", "url(#colorGradient)")
        .style("stroke", "#333");

    // --- 3. Ajouter les Étiquettes (Min/Max) ---

    // Texte Minimum
    legendGroup.append("text")
        .attr("x", 0)
        .attr("y", legendHeight + 15)
        .attr("text-anchor", "start")
        .style("font-size", "10px")
        .text(`Faible Abondance: ${minVal.toFixed(1)}`);

    // Texte Maximum
    legendGroup.append("text")
        .attr("x", legendWidth)
        .attr("y", legendHeight + 15)
        .attr("text-anchor", "end")
        .style("font-size", "10px")
        .text(`Forte Abondance: ${maxVal.toFixed(1)}`);
        
    // Titre de la légende
    legendGroup.append("text")
        .attr("x", legendWidth / 2)
        .attr("y", -5)
        .attr("text-anchor", "middle")
        .style("font-size", "12px")
        .style("font-weight", "bold")
        .text("Abondance des Espèces");
}