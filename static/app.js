// Global State Variables
let metadata = null;
let currentClusterData = null;
let filteredRecords = [];
let currentPage = 1;
const rowsPerPage = 15;
let currentSortColumn = "CUST_ID";
let currentSortDirection = "asc";

// Chart instances for recycling
let elbowChart = null;
let silhouetteChart = null;

// DOM Elements
const themeToggleBtn = document.getElementById("theme-toggle");
const featureSelectors = document.getElementById("feature-selectors");
const kInput = document.getElementById("cluster-k-input");
const kValueDisplay = document.getElementById("k-val-display");
const normalizeCheckbox = document.getElementById("normalize-data-checkbox");
const runClusteringBtn = document.getElementById("run-clustering-btn");

const statTotalCustomers = document.getElementById("stat-total-customers");
const statAvgBalance = document.getElementById("stat-avg-balance");
const statAvgPurchases = document.getElementById("stat-avg-purchases");
const statAvgLimit = document.getElementById("stat-avg-limit");
const sidebarTotalSamples = document.getElementById("sidebar-total-samples");

const lblSilhouette = document.getElementById("lbl-silhouette-score");
const lblWcss = document.getElementById("lbl-wcss-score");

const tabLinks = document.querySelectorAll(".tab-link");
const tabContents = document.querySelectorAll(".tab-content");

const profilesContainer = document.getElementById("profiles-container");

const searchInput = document.getElementById("table-search");
const clusterFilter = document.getElementById("table-cluster-filter");
const exportCsvBtn = document.getElementById("export-csv-btn");
const customerTableBody = document.getElementById("customer-table-body");
const customerTableHeaders = document.querySelectorAll("#customer-table th");

const paginationStart = document.getElementById("pagination-start");
const paginationEnd = document.getElementById("pagination-end");
const paginationTotal = document.getElementById("pagination-total");
const prevPageBtn = document.getElementById("prev-page-btn");
const nextPageBtn = document.getElementById("next-page-btn");
const pageNumDisplay = document.getElementById("page-num-display");

// Initialize Application
document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    loadMetadata();
    setupEventListeners();
});

// Theme Management
function initTheme() {
    const savedTheme = localStorage.getItem("color-scheme") || "dark";
    setTheme(savedTheme);
}

function setTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("color-scheme", theme);
    
    // Update theme toggle icon
    const icon = themeToggleBtn.querySelector("i");
    if (theme === "light") {
        icon.className = "fa-solid fa-sun";
    } else {
        icon.className = "fa-solid fa-moon";
    }
    
    // Re-draw plotly chart with correct theme colors if data exists
    if (currentClusterData) {
        drawClusterPlot(currentClusterData);
    }
}

themeToggleBtn.addEventListener("click", () => {
    const currentTheme = document.documentElement.getAttribute("data-theme");
    setTheme(currentTheme === "light" ? "dark" : "light");
});

// Setup Listeners
function setupEventListeners() {
    // K-Slider update
    kInput.addEventListener("input", (e) => {
        kValueDisplay.textContent = e.target.value;
    });

    // Run button
    runClusteringBtn.addEventListener("click", () => {
        executeClustering();
    });

    // Navigation Tabs
    tabLinks.forEach(tab => {
        tab.addEventListener("click", (e) => {
            const targetTab = e.currentTarget.getAttribute("data-tab");
            
            tabLinks.forEach(t => t.classList.remove("active"));
            tabContents.forEach(c => c.classList.remove("active"));
            
            e.currentTarget.classList.add("active");
            document.getElementById(targetTab).classList.add("active");
            
            // Plotly requires a resize trigger when display status changes to draw correctly
            if (targetTab === "cluster-plot-tab") {
                Plotly.Plots.resize(document.getElementById("cluster-plotly-chart"));
            }
        });
    });

    // Table search & filter
    searchInput.addEventListener("input", () => {
        currentPage = 1;
        applyFilters();
    });
    
    clusterFilter.addEventListener("change", () => {
        currentPage = 1;
        applyFilters();
    });

    // Sort table
    customerTableHeaders.forEach(th => {
        th.addEventListener("click", () => {
            const col = th.getAttribute("data-sort");
            if (currentSortColumn === col) {
                currentSortDirection = currentSortDirection === "asc" ? "desc" : "asc";
            } else {
                currentSortColumn = col;
                currentSortDirection = "asc";
            }
            
            // Update sort icon classes
            customerTableHeaders.forEach(header => {
                const icon = header.querySelector("i");
                if (header === th) {
                    icon.className = currentSortDirection === "asc" ? "fa-solid fa-sort-up" : "fa-solid fa-sort-down";
                } else {
                    icon.className = "fa-solid fa-sort";
                }
            });
            
            sortRecords();
            renderTable();
        });
    });

    // Table Pagination
    prevPageBtn.addEventListener("click", () => {
        if (currentPage > 1) {
            currentPage--;
            renderTable();
        }
    });

    nextPageBtn.addEventListener("click", () => {
        const totalPages = Math.ceil(filteredRecords.length / rowsPerPage);
        if (currentPage < totalPages) {
            currentPage++;
            renderTable();
        }
    });

    // Export CSV
    exportCsvBtn.addEventListener("click", exportToCSV);
}

// Fetch metadata from backend
async function loadMetadata() {
    try {
        const response = await fetch("/api/data");
        if (!response.ok) throw new Error("Failed to fetch metadata");
        metadata = await response.json();
        
        // Populate stats cards
        statTotalCustomers.textContent = metadata.total_records.toLocaleString();
        sidebarTotalSamples.textContent = metadata.total_records.toLocaleString();
        
        statAvgBalance.textContent = `$${Math.round(metadata.summary["BALANCE"]["mean"]).toLocaleString()}`;
        statAvgPurchases.textContent = `$${Math.round(metadata.summary["PURCHASES"]["mean"]).toLocaleString()}`;
        statAvgLimit.textContent = `$${Math.round(metadata.summary["CREDIT_LIMIT"]["mean"]).toLocaleString()}`;
        
        // Render feature selectors checkboxes
        renderFeatureSelectors(metadata.features);
        
        // Execute clustering automatically on load
        executeClustering();
        
    } catch (error) {
        console.error("Error loading metadata:", error);
        alert("Failed to connect to the backend server. Make sure FastAPI server is running.");
    }
}

// Render checkboxes in sidebar
function renderFeatureSelectors(features) {
    featureSelectors.innerHTML = "";
    
    // Friendly descriptions for the 17 behavioral metrics
    const descMap = {
        "BALANCE": "Account balance left ($)",
        "BALANCE_FREQUENCY": "Update frequency of balance (0 to 1)",
        "PURCHASES": "Total purchase amount ($)",
        "ONEOFF_PURCHASES": "Max single purchase amount ($)",
        "INSTALLMENTS_PURCHASES": "Installment purchases amount ($)",
        "CASH_ADVANCE": "Cash advance given by user ($)",
        "PURCHASES_FREQUENCY": "Purchase frequency score (0 to 1)",
        "ONEOFF_PURCHASES_FREQUENCY": "Oneoff purchase frequency (0 to 1)",
        "PURCHASES_INSTALLMENTS_FREQUENCY": "Installment frequency (0 to 1)",
        "CASH_ADVANCE_FREQUENCY": "Cash advance frequency (0 to 1)",
        "CASH_ADVANCE_TRX": "Number of cash advance transactions",
        "PURCHASES_TRX": "Number of purchases made",
        "CREDIT_LIMIT": "Credit card credit limit ($)",
        "PAYMENTS": "Amount of payments made ($)",
        "MINIMUM_PAYMENTS": "Minimum payments made ($)",
        "PRC_FULL_PAYMENT": "Percent of full payment paid (0 to 1)",
        "TENURE": "Account tenure (6 to 12 months)"
    };

    features.forEach((feat, index) => {
        const label = document.createElement("label");
        label.className = "feature-pill-checkbox";
        
        // Default checks: BALANCE and PURCHASES
        const isDefaultChecked = feat === "BALANCE" || feat === "PURCHASES";
        if (isDefaultChecked) {
            label.classList.add("checked");
        }

        label.innerHTML = `
            <input type="checkbox" name="feature" value="${feat}" ${isDefaultChecked ? "checked" : ""}>
            <span class="feature-pill-label">
                <span class="feature-pill-name">${feat.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase())}</span>
                <span class="feature-pill-desc">${descMap[feat] || ""}</span>
            </span>
        `;
        
        // Toggle selected styling when check status changes
        const input = label.querySelector("input");
        input.addEventListener("change", (e) => {
            const checkedCount = document.querySelectorAll('input[name="feature"]:checked').length;
            
            // Limit checks between 2 and 3 features
            if (checkedCount < 2) {
                e.preventDefault();
                input.checked = true;
                alert("Please select at least 2 features for K-Means clustering.");
                return;
            }
            if (checkedCount > 3) {
                e.preventDefault();
                input.checked = false;
                alert("You can select up to 3 features for multi-dimensional visualization.");
                return;
            }

            if (input.checked) {
                label.classList.add("checked");
            } else {
                label.classList.remove("checked");
            }
        });

        featureSelectors.appendChild(label);
    });
}

// Get selected features from sidebar checkboxes
function getSelectedFeatures() {
    const checkedBoxes = document.querySelectorAll('input[name="feature"]:checked');
    const selected = [];
    checkedBoxes.forEach(cb => selected.push(cb.value));
    return selected;
}

// Perform Clustering Analysis
async function executeClustering() {
    const features = getSelectedFeatures();
    const k = parseInt(kInput.value);
    const normalise = normalizeCheckbox.checked;
    
    // Show spinner in Plot container
    const plotContainer = document.getElementById("cluster-plotly-chart");
    plotContainer.innerHTML = `
        <div class="chart-loading">
            <i class="fa-solid fa-circle-notch fa-spin"></i>
            <p>Fitting K-Means model for ${metadata ? metadata.total_records.toLocaleString() : '8,950'} accounts...</p>
        </div>
    `;

    try {
        const response = await fetch("/api/cluster", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ features, k, normalise })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || "Failed to calculate clustering");
        }

        currentClusterData = await response.json();
        
        // Update Silhouette & WCSS labels
        lblSilhouette.textContent = currentClusterData.silhouette.toFixed(4);
        lblWcss.textContent = currentClusterData.wcss.toLocaleString(undefined, { maximumFractionDigits: 1 });
        
        // Re-populate Table Filter dropdown
        updateClusterFilterDropdown(k);
        
        // Draw Plotly scatter plot
        drawClusterPlot(currentClusterData);
        
        // Draw Elbow curve & Silhouette validation charts
        drawValidationCharts(currentClusterData.elbow_data, k);
        
        // Draw Cluster Profile Card Personas
        drawClusterProfiles(currentClusterData.profiles, features);
        
        // Populate and filter table
        applyFilters();

    } catch (error) {
        console.error("Clustering API Error:", error);
        plotContainer.innerHTML = `
            <div class="chart-loading" style="color: var(--pink-accent)">
                <i class="fa-solid fa-triangle-exclamation"></i>
                <p>Error performing clustering analysis: ${error.message}</p>
            </div>
        `;
    }
}

// Dynamic cluster table filter options
function updateClusterFilterDropdown(k) {
    const filter = document.getElementById("table-cluster-filter");
    filter.innerHTML = `<option value="all">All Clusters</option>`;
    
    for (let i = 0; i < k; i++) {
        const option = document.createElement("option");
        option.value = i;
        option.textContent = `Cluster ${i}`;
        filter.appendChild(option);
    }
}

// 2D/3D Plotly Visualizer
function drawClusterPlot(data) {
    const features = getSelectedFeatures();
    const records = data.records;
    const centroids = data.centroids;
    const is3D = features.length === 3;
    
    const theme = document.documentElement.getAttribute("data-theme");
    const isDark = theme !== "light";
    
    // Background and text styles corresponding to theme
    const layoutBg = isDark ? "rgba(13, 19, 38, 0.5)" : "rgba(255, 255, 255, 0.8)";
    const textColor = isDark ? "#94a3b8" : "#475569";
    const gridColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)";
    
    // Distinct neon colors for clusters
    const clusterColors = [
        "#ff2a85", // Pink
        "#3b82f6", // Blue
        "#00ff88", // Green
        "#8a2be2", // Purple
        "#f59e0b", // Yellow/Orange
        "#14b8a6", // Teal
        "#ec4899", // Magenta
        "#8b5cf6", // Violet
        "#ef4444", // Red
        "#06b6d4"  // Cyan
    ];

    const traces = [];
    
    // Group records by Cluster
    const clusterGroups = {};
    records.forEach(r => {
        const c = r.Cluster;
        if (!clusterGroups[c]) clusterGroups[c] = [];
        clusterGroups[c].push(r);
    });

    // 1. Create a scatter trace for each cluster
    Object.keys(clusterGroups).forEach(cId => {
        const cNum = parseInt(cId);
        const group = clusterGroups[cId];
        const color = clusterColors[cNum % clusterColors.length];
        const name = centroids.find(ctr => ctr.cluster_id === cNum).name;
        
        const xVals = group.map(r => r[features[0]]);
        const yVals = group.map(r => r[features[1]]);
        
        let hoverTemplate = `<b>Cardholder ID:</b> %{customdata[0]}<br>` +
                            `<b>Balance:</b> $%{customdata[1]:.2f}<br>` +
                            `<b>Purchases:</b> $%{customdata[2]:.2f}<br>` +
                            `<b>Cash Advance:</b> $%{customdata[3]:.2f}<br>` +
                            `<b>Credit Limit:</b> $%{customdata[4]:.2f}<br>` +
                            `<extra></extra>`;
                            
        const customData = group.map(r => [
            r.CUST_ID,
            r.BALANCE,
            r.PURCHASES,
            r.CASH_ADVANCE,
            r.CREDIT_LIMIT
        ]);

        if (is3D) {
            const zVals = group.map(r => r[features[2]]);
            traces.push({
                x: xVals,
                y: yVals,
                z: zVals,
                mode: 'markers',
                type: 'scatter3d',
                name: name,
                customdata: customData,
                hovertemplate: hoverTemplate,
                marker: {
                    size: 2.5, // Smaller for 3D with 9k points
                    color: color,
                    opacity: 0.65,
                    line: {
                        color: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)',
                        width: 0.3
                    }
                }
            });
        } else {
            traces.push({
                x: xVals,
                y: yVals,
                mode: 'markers',
                type: 'scatter',
                name: name,
                customdata: customData,
                hovertemplate: hoverTemplate,
                marker: {
                    size: 4.5, // Smaller for 2D with 9k points
                    color: color,
                    opacity: 0.6,
                    line: {
                        color: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.5)',
                        width: 0.5
                    }
                }
            });
        }
    });

    // 2. Add Centroids Trace
    const cxVals = centroids.map(c => c[features[0]]);
    const cyVals = centroids.map(c => c[features[1]]);
    
    if (is3D) {
        const czVals = centroids.map(c => c[features[2]]);
        traces.push({
            x: cxVals,
            y: cyVals,
            z: czVals,
            mode: 'markers',
            type: 'scatter3d',
            name: 'Centroids',
            marker: {
                size: 8,
                color: isDark ? '#ffffff' : '#000000',
                symbol: 'cross',
                line: {
                    color: '#00e5ff',
                    width: 2
                }
            },
            hovertemplate: `<b>Cluster Centroid</b><br>` +
                           `${features[0]}: %{x:.1f}<br>` +
                           `${features[1]}: %{y:.1f}<br>` +
                           `${features[2]}: %{z:.1f}<extra></extra>`
        });
    } else {
        traces.push({
            x: cxVals,
            y: cyVals,
            mode: 'markers',
            type: 'scatter',
            name: 'Centroids',
            marker: {
                size: 13,
                color: isDark ? '#ffffff' : '#000000',
                symbol: 'x',
                line: {
                    color: '#00e5ff',
                    width: 2
                }
            },
            hovertemplate: `<b>Cluster Centroid</b><br>` +
                           `${features[0]}: %{x:.1f}<br>` +
                           `${features[1]}: %{y:.1f}<extra></extra>`
        });
    }

    // Configure layout
    const layout = {
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        margin: { l: 40, r: 20, t: 40, b: 40 },
        font: {
            family: 'Inter, sans-serif',
            color: textColor
        },
        legend: {
            orientation: 'h',
            y: -0.15,
            x: 0.5,
            xanchor: 'center',
            font: { size: 11 }
        },
        hovermode: 'closest'
    };

    if (is3D) {
        layout.scene = {
            xaxis: {
                title: { text: features[0].replace(/_/g, " ").title, font: { size: 11 } },
                gridcolor: gridColor,
                zerolinecolor: gridColor,
                backgroundcolor: layoutBg,
                showbackground: true
            },
            yaxis: {
                title: { text: features[1].replace(/_/g, " ").title, font: { size: 11 } },
                gridcolor: gridColor,
                zerolinecolor: gridColor,
                backgroundcolor: layoutBg,
                showbackground: true
            },
            zaxis: {
                title: { text: features[2].replace(/_/g, " ").title, font: { size: 11 } },
                gridcolor: gridColor,
                zerolinecolor: gridColor,
                backgroundcolor: layoutBg,
                showbackground: true
            },
            camera: {
                eye: { x: 1.5, y: 1.5, z: 1.2 }
            }
        };
    } else {
        layout.xaxis = {
            title: { text: features[0].replace(/_/g, " "), font: { size: 13, weight: 600 } },
            gridcolor: gridColor,
            zerolinecolor: gridColor,
            linecolor: gridColor
        };
        layout.yaxis = {
            title: { text: features[1].replace(/_/g, " "), font: { size: 13, weight: 600 } },
            gridcolor: gridColor,
            zerolinecolor: gridColor,
            linecolor: gridColor
        };
    }

    const config = {
        responsive: true,
        displayModeBar: true,
        displaylogo: false,
        modeBarButtonsToRemove: ['select2d', 'lasso2d', 'resetScale2d']
    };

    Plotly.newPlot('cluster-plotly-chart', traces, layout, config);
}

// Chart.js validator (Elbow & Silhouette) charts
function drawValidationCharts(elbowData, currentK) {
    const labels = elbowData.map(d => d.k);
    const wcssVals = elbowData.map(d => d.wcss);
    const silVals = elbowData.map(d => d.silhouette);
    
    const theme = document.documentElement.getAttribute("data-theme");
    const isLight = theme === "light";
    const gridColor = isLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.06)";
    const textColor = isLight ? "#475569" : "#94a3b8";

    // 1. Draw WCSS Elbow Curve
    if (elbowChart) elbowChart.destroy();
    
    const pointColors = labels.map(k => k === currentK ? "#00e5ff" : "rgba(59, 130, 246, 0.4)");
    const pointSizes = labels.map(k => k === currentK ? 8 : 4);
    
    const ctxElbow = document.getElementById("elbow-chart-canvas").getContext("2d");
    elbowChart = new Chart(ctxElbow, {
        type: "line",
        data: {
            labels: labels,
            datasets: [{
                label: "WCSS (Inertia)",
                data: wcssVals,
                borderColor: "#3b82f6",
                borderWidth: 2,
                backgroundColor: "rgba(59, 130, 246, 0.1)",
                fill: true,
                tension: 0.3,
                pointBackgroundColor: pointColors,
                pointBorderColor: pointColors,
                pointRadius: pointSizes,
                pointHoverRadius: 9
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return ` WCSS: ${context.parsed.y.toLocaleString(undefined, {maximumFractionDigits:1})}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: { display: true, text: "Number of Clusters (K)", color: textColor },
                    grid: { color: gridColor },
                    ticks: { color: textColor }
                },
                y: {
                    title: { display: true, text: "WCSS", color: textColor },
                    grid: { color: gridColor },
                    ticks: { color: textColor }
                }
            }
        }
    });

    // 2. Draw Silhouette Score Chart
    if (silhouetteChart) silhouetteChart.destroy();
    
    const barColors = labels.map(k => k === currentK ? "#00ff88" : "rgba(138, 43, 226, 0.3)");
    const borderColors = labels.map(k => k === currentK ? "#00ff88" : "rgba(138, 43, 226, 0.6)");
    
    const ctxSil = document.getElementById("silhouette-chart-canvas").getContext("2d");
    silhouetteChart = new Chart(ctxSil, {
        type: "bar",
        data: {
            labels: labels,
            datasets: [{
                label: "Silhouette Coefficient",
                data: silVals,
                backgroundColor: barColors,
                borderColor: borderColors,
                borderWidth: 1.5,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    title: { display: true, text: "Number of Clusters (K)", color: textColor },
                    grid: { color: gridColor },
                    ticks: { color: textColor }
                },
                y: {
                    title: { display: true, text: "Silhouette Score", color: textColor },
                    grid: { color: gridColor },
                    ticks: { color: textColor },
                    min: 0,
                    max: 1
                }
            }
        }
    });
    
    // Compute suggested K
    let maxSil = -1;
    let bestK = 5;
    elbowData.forEach(d => {
        if (d.silhouette > maxSil) {
            maxSil = d.silhouette;
            bestK = d.k;
        }
    });
    document.getElementById("optimal-k-badge").innerHTML = `<i class="fa-solid fa-lightbulb"></i> Suggested K: ${bestK}`;
}

// Draw Cluster Profiles (Personas)
function drawClusterProfiles(profiles, features) {
    profilesContainer.innerHTML = "";
    profiles.sort((a,b) => a.id - b.id);
    
    profiles.forEach(p => {
        const card = document.createElement("div");
        card.className = `profile-card glass-panel cluster-${p.id}`;
        
        let featHtml = "";
        features.forEach(feat => {
            const val = p.centroids[feat];
            const name = feat.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
            // If it is a currency feature, format as cash
            const displayVal = ["BALANCE", "PURCHASES", "ONEOFF_PURCHASES", "INSTALLMENTS_PURCHASES", "CASH_ADVANCE", "CREDIT_LIMIT", "PAYMENTS", "MINIMUM_PAYMENTS"].includes(feat)
                ? `$${Math.round(val).toLocaleString()}`
                : val.toFixed(2);
                
            featHtml += `<div class="p-metric">
                            <span>${name}</span>
                            <span>${displayVal}</span>
                         </div>`;
        });
        
        // Segment descriptive comments based on cluster names
        let desc = "Credit card holders categorized by transaction activity patterns.";
        if (p.name.includes("VIPs")) {
            desc = "High-income profiles maintaining large card balances and purchasing heavily. Primary tier for credit limit increases and premium cards.";
        } else if (p.name.includes("Borrowers")) {
            desc = "Regularly withdraw cash advances and maintain high balances, but rarely use the card for physical retail. Highly lucrative interest generators.";
        } else if (p.name.includes("Savers")) {
            desc = "High account balances but very conservative spending. Maintain safety funds, representing latent credit potential.";
        } else if (p.name.includes("Shoppers")) {
            desc = "Keep low card balances but execute high-frequency purchases. Very active transactors, ideal for rewards program promotions.";
        } else if (p.name.includes("Inactive")) {
            desc = "Budget-conscious accounts or inactive profiles with near-zero balances and spending. High churn risk.";
        } else if (p.name.includes("Standard")) {
            desc = "Average balances and moderate transactions. Stable core audience representing typical user base.";
        }
        
        card.innerHTML = `
            <div class="profile-header">
                <div class="profile-title">
                    <h3>${p.name}</h3>
                    <span class="profile-meta">Segment ID: ${p.id}</span>
                </div>
                <span class="profile-badge">Size: ${p.size.toLocaleString()} (${p.percentage.toFixed(1)}%)</span>
            </div>
            
            <div class="profile-metrics">
                ${featHtml}
            </div>
            
            <div class="profile-details">
                <p class="profile-desc">${desc}</p>
            </div>
        `;
        profilesContainer.appendChild(card);
    });
}

// Filtering and Searching database records
function applyFilters() {
    if (!currentClusterData) return;
    
    const query = searchInput.value.toLowerCase();
    const clusterVal = clusterFilter.value;
    
    filteredRecords = currentClusterData.records.filter(r => {
        // Text search match
        const matchesQuery = 
            r.CUST_ID.toLowerCase().includes(query) ||
            r.BALANCE.toFixed(1).includes(query) ||
            r.PURCHASES.toFixed(1).includes(query) ||
            r.CASH_ADVANCE.toFixed(1).includes(query) ||
            r.CREDIT_LIMIT.toFixed(1).includes(query) ||
            r.ClusterName.toLowerCase().includes(query);
            
        // Cluster ID match
        const matchesCluster = clusterVal === "all" || r.Cluster.toString() === clusterVal;
        
        return matchesQuery && matchesCluster;
    });
    
    sortRecords();
    renderTable();
}

// Sorting logic
function sortRecords() {
    filteredRecords.sort((a, b) => {
        let valA = a[currentSortColumn];
        let valB = b[currentSortColumn];
        
        if (typeof valA === "string") {
            valA = valA.toLowerCase();
            valB = valB.toLowerCase();
        }
        
        if (valA < valB) return currentSortDirection === "asc" ? -1 : 1;
        if (valA > valB) return currentSortDirection === "asc" ? 1 : -1;
        return 0;
    });
}

// Render dynamic rows in table
function renderTable() {
    customerTableBody.innerHTML = "";
    
    const totalCount = filteredRecords.length;
    paginationTotal.textContent = totalCount.toLocaleString();
    
    if (totalCount === 0) {
        customerTableBody.innerHTML = `
            <tr>
                <td colspan="6" class="table-empty">No accounts found matching the search criteria.</td>
            </tr>
        `;
        paginationStart.textContent = 0;
        paginationEnd.textContent = 0;
        prevPageBtn.disabled = true;
        nextPageBtn.disabled = true;
        pageNumDisplay.textContent = "Page 1";
        return;
    }
    
    const totalPages = Math.ceil(totalCount / rowsPerPage);
    if (currentPage > totalPages) currentPage = totalPages || 1;
    
    const startIndex = (currentPage - 1) * rowsPerPage;
    const endIndex = Math.min(startIndex + rowsPerPage, totalCount);
    
    paginationStart.textContent = (startIndex + 1).toLocaleString();
    paginationEnd.textContent = endIndex.toLocaleString();
    
    prevPageBtn.disabled = currentPage === 1;
    nextPageBtn.disabled = currentPage === totalPages;
    pageNumDisplay.textContent = `Page ${currentPage} of ${totalPages}`;
    
    const pageRecords = filteredRecords.slice(startIndex, endIndex);
    
    const clusterPillStyles = [
        "background-color: var(--pink-accent-glow); color: var(--pink-accent); border: 1px solid var(--pink-accent)",
        "background-color: var(--blue-accent-glow); color: var(--blue-accent); border: 1px solid var(--blue-accent)",
        "background-color: var(--green-accent-glow); color: var(--green-accent); border: 1px solid var(--green-accent)",
        "background-color: var(--purple-accent-glow); color: var(--purple-accent); border: 1px solid var(--purple-accent)",
        "background-color: rgba(245, 158, 11, 0.1); color: #f59e0b; border: 1px solid #f59e0b",
        "background-color: rgba(20, 184, 166, 0.1); color: #14b8a6; border: 1px solid #14b8a6",
        "background-color: rgba(236, 72, 153, 0.1); color: #ec4899; border: 1px solid #ec4899",
        "background-color: rgba(139, 92, 246, 0.1); color: #8b5cf6; border: 1px solid #8b5cf6",
        "background-color: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid #ef4444",
        "background-color: rgba(6, 182, 212, 0.1); color: #06b6d4; border: 1px solid #06b6d4"
    ];

    pageRecords.forEach(r => {
        const tr = document.createElement("tr");
        const pillStyle = clusterPillStyles[r.Cluster % clusterPillStyles.length];
        
        tr.innerHTML = `
            <td>#${r.CUST_ID}</td>
            <td>$${r.BALANCE.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            <td>$${r.PURCHASES.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            <td>$${r.CASH_ADVANCE.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            <td>$${r.CREDIT_LIMIT.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            <td>
                <span class="c-pill" style="${pillStyle}">${r.ClusterName}</span>
            </td>
        `;
        customerTableBody.appendChild(tr);
    });
}

// CSV Export Helper
function exportToCSV() {
    if (filteredRecords.length === 0) {
        alert("No records to export.");
        return;
    }
    
    const headers = ["CUST_ID", "BALANCE", "PURCHASES", "CASH_ADVANCE", "CREDIT_LIMIT", "PAYMENTS", "ClusterID", "ClusterName"];
    
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += headers.join(",") + "\r\n";
    
    filteredRecords.forEach(r => {
        const row = [
            r.CUST_ID,
            r.BALANCE,
            r.PURCHASES,
            r.CASH_ADVANCE,
            r.CREDIT_LIMIT,
            r.PAYMENTS,
            r.Cluster,
            `"${r.ClusterName}"`
        ];
        csvContent += row.join(",") + "\r\n";
    });
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "credit_card_segmentation_export.csv");
    document.body.appendChild(link);
    
    link.click();
    document.body.removeChild(link);
}
