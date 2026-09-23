# Clustify - Credit Card Customer Segmentation & Clustering Dashboard

Clustify is an interactive, high-fidelity customer segmentation platform built to profile and categorize credit card holders. Leveraging the **Credit Card Customer Segmentation dataset** (~8,950 accounts, 17 behavioral features), the application executes K-Means clustering in the backend and visualizes customer groupings in a glassmorphic dashboard featuring dynamic 2D/3D scatter plots, Elbow curves, and Silhouette score validations.

## 🚀 Key Features

* **Dynamic Multi-Dimensional Clustering**: Perform clustering analysis on any 2 features (2D scatter plot) or 3 features (3D Plotly visualization).
* **Interactive ML Hyperparameters**: Adjust the number of clusters ($K$) on-the-fly from 2 to 10 and toggle standard scaling (z-score normalization) to keep feature variances from dominating calculations.
* **Auto-Generated Personas**: A centroid-based heuristic engine maps geometric cluster centers to financial segments:
  * **Active VIPs** (High Balance, High Purchases)
  * **Borrowers** (High Balance, High Cash Advances)
  * **Wealthy Savers** (High Balance, Low Purchases)
  * **Frugal Shoppers** (Low Balance, High Purchases)
  * **Inactive/Budget** (Low Balance, Low Purchases)
* **Model Quality Diagnostics**: Real-time evaluation curves using the Elbow Method (Within-Cluster Sum of Squares) and Silhouette score validations to discover the optimal number of groups.
* **Account Database**: Search, sort, and paginate through all 8,950 cardholders, with a single-click option to export the segmented cohorts as a CSV.
* **Premium UX & Responsive Design**: Designed with glassmorphic cards, neon glowing accents, smooth transitions, custom scrollbars, and system-adaptive light/dark modes.

---

## 🛠️ Technology Stack

* **Backend**: Python, FastAPI, Uvicorn, Scikit-Learn, Pandas, NumPy
* **Frontend**: HTML5, Vanilla CSS (Glassmorphic theme), ES6 JavaScript, Plotly.js (3D/2D rendering), Chart.js (Line/Bar diagnostics), FontAwesome (Icons)

---

## 📂 Project Structure

```
clustering/
│
├── main.py                 # FastAPI backend server & K-Means clustering endpoints
├── requirements.txt        # Python backend dependencies
├── CC_GENERAL.csv          # Credit Card holder dataset (~8,950 rows, 18 columns)
├── README.md               # Project documentation
│
└── static/                 # Static assets directory
    ├── index.html          # Dashboard HTML structure
    ├── styles.css          # Glassmorphic CSS style definitions
    └── app.js              # Client side data binding, Plotly, Chart.js, & controls
```

---

## 💻 Quick Start & Installation

### 1. Clone & Setup Workspace
Navigate to the directory containing this project:
```bash
python3 -m venv venv
source venv/bin/activate
```

### 2. Install Dependencies
Install the required data-science and web libraries:
```bash
pip install -r requirements.txt
```

### 3. Run the Server
Launch the FastAPI uvicorn daemon:
```bash
python3 main.py
```
*(The server will startup on `http://127.0.0.1:8000` with hot-reload enabled)*

### 4. Open in Browser
Open your browser and navigate to **[http://127.0.0.1:8000](http://127.0.0.1:8000)**.
