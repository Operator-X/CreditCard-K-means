# Clustify: Credit Card Customer Segmentation and Clustering Dashboard

Clustify is an end-to-end, interactive machine learning dashboard designed for unsupervised customer segmentation and behavioral profiling of credit card account holders. The application integrates a FastAPI backend with Scikit-Learn to execute K-Means clustering in real time, exposing interactive 2D and 3D visual representations, model diagnostics (Elbow method and Silhouette analysis), automated segment persona assignment, and customer data export.

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Machine Learning Pipeline](#machine-learning-pipeline)
  - [Data Ingestion and Preprocessing](#data-ingestion-and-preprocessing)
  - [Standardization](#standardization)
  - [K-Means Clustering](#k-means-clustering)
  - [Diagnostic Evaluation Metrics](#diagnostic-evaluation-metrics)
  - [Automated Persona Heuristics](#automated-persona-heuristics)
- [Dataset Schema](#dataset-schema)
- [System Architecture and API Reference](#system-architecture-and-api-reference)
- [Project Directory Structure](#project-directory-structure)
- [Installation and Setup](#installation-and-setup)
- [Running the Application](#running-the-application)
- [Technology Stack](#technology-stack)

---

## Overview

Credit card issuers handle vast volumes of multi-dimensional transactional and balance data. Identifying cohesive customer groupings is essential for risk assessment, promotional credit line adjustments, targeted reward campaigns, and churn mitigation.

Clustify allows users to dynamically select behavioral dimensions, tune the cluster count (K), inspect centroid profiles, compare model quality metrics across candidate cluster counts, and inspect or export labeled cohorts.

---

## Key Features

- **Multi-Dimensional Clustering**: Visualize customer cohorts in interactive 2D scatter plots (2 selected features) or 3D scatter plots (3 selected features) rendered via Plotly.js with zoom, rotate, and pan capabilities.
- **Dynamic Hyperparameter Tuning**: Adjust the number of clusters (K from 2 to 10) on the fly with immediate server-side recomputation.
- **Feature Standardization Toggle**: Option to apply standard Z-score normalization (`StandardScaler`) to prevent high-magnitude features (such as `BALANCE` or `CREDIT_LIMIT`) from dominating geometric distance metrics over ratio-based features.
- **Model Evaluation Diagnostics**: Real-time evaluation curves showing:
  - Within-Cluster Sum of Squares (WCSS / Inertia) across K = 2 to 10 for Elbow analysis.
  - Silhouette Coefficient across K = 2 to 10 to measure cluster cohesion versus separation.
- **Centroid-Based Persona Heuristics**: Automatic categorization of clusters into interpretable business profiles:
  - Active VIPs (High Balance, High Purchases)
  - Borrowers (High Cash Advances, High Balance)
  - Wealthy Savers (High Balance, Low Purchases)
  - Frugal Shoppers (Low Balance, High Purchases)
  - Inactive/Budget Accounts (Low Balance, Low Purchases)
- **Account Database and Export**: Filterable, sortable, and paginated data table displaying cardholder records alongside their assigned cluster IDs and segment names, with one-click CSV export of labeled cohorts.
- **Glassmorphic User Interface**: Polished UI with responsive layout, custom typography, accessible contrast, and persistent light/dark mode support.

---

## Machine Learning Pipeline

### Data Ingestion and Preprocessing
The application loads customer records from `CC_GENERAL.csv`. Missing values in critical fields are handled systematically:
- Missing entries in `CREDIT_LIMIT` are imputed using the column median.
- Missing entries in `MINIMUM_PAYMENTS` are imputed using the column median.
- Non-feature identification columns (`CUST_ID`) are excluded from model training.

### Standardization
When feature standardization is enabled, values are transformed using Z-score scaling:

$$z = \frac{x - \mu}{\sigma}$$

This ensures each selected feature has zero mean and unit variance, allowing Euclidean distance calculations in K-Means to treat relative variances fairly.

### K-Means Clustering
The system fits Scikit-Learn's `KMeans` algorithm using:
- Cluster count: User-defined $K \in [2, 10]$
- Initialization: `k-means++`
- Re-initialization attempts: `n_init=10`
- Random seed: Fixed `random_state=42` for consistent reproducibility

### Diagnostic Evaluation Metrics
For every clustering run, the backend calculates:
1. **Inertia (Within-Cluster Sum of Squares - WCSS)**:
   $$\text{WCSS} = \sum_{j=1}^{K} \sum_{x_i \in C_j} ||x_i - \mu_j||^2$$
2. **Silhouette Coefficient**:
   $$s(i) = \frac{b(i) - a(i)}{\max(a(i), b(i))}$$
   Where $a(i)$ is the mean intra-cluster distance and $b(i)$ is the mean nearest-cluster distance. The score ranges from -1 (poor grouping) to +1 (dense, well-separated clusters). To ensure fast API response times on larger datasets, silhouette evaluations utilize a representative sample (3,000 observations).

### Automated Persona Heuristics
Cluster centroids are compared against global dataset averages. When standard financial indicators (`BALANCE`, `PURCHASES`, `CASH_ADVANCE`) are selected, the system assigns human-readable segment names based on threshold variances from population means. When alternative feature sets are selected, composite labels reflecting relative attribute levels (e.g., "High Payments & Low Balance Users") are generated automatically.

---

## Dataset Schema

The primary dataset (`CC_GENERAL.csv`) tracks approximately 8,950 credit card accounts over a 6-month observation window with 18 columns:

| Column Name | Data Type | Description |
| :--- | :--- | :--- |
| `CUST_ID` | String | Unique credit card holder identifier (excluded from clustering) |
| `BALANCE` | Float | Outstanding account balance recorded |
| `BALANCE_FREQUENCY` | Float | Frequency of balance updates, scored between 0 and 1 |
| `PURCHASES` | Float | Total dollar value of purchases made |
| `ONEOFF_PURCHASES` | Float | Maximum purchase transaction amount completed in one go |
| `INSTALLMENTS_PURCHASES` | Float | Cumulative value of purchases done in installment installments |
| `CASH_ADVANCE` | Float | Cash advance amount disbursed |
| `PURCHASES_FREQUENCY` | Float | How frequently purchases are made (0 to 1) |
| `ONEOFF_PURCHASES_FREQUENCY`| Float | Frequency of one-off purchases (0 to 1) |
| `PURCHASES_INSTALLMENTS_FREQUENCY` | Float | Frequency of installment purchases (0 to 1) |
| `CASH_ADVANCE_FREQUENCY` | Float | Frequency of cash advance withdrawals (0 to 1) |
| `CASH_ADVANCE_TRX` | Integer | Total count of cash advance transactions |
| `PURCHASES_TRX` | Integer | Total count of purchase transactions completed |
| `CREDIT_LIMIT` | Float | Maximum credit line extended to the cardholder |
| `PAYMENTS` | Float | Total dollar amount of payments made by the user |
| `MINIMUM_PAYMENTS` | Float | Minimum cumulative amount paid toward statement balances |
| `PRC_FULL_PAYMENT` | Float | Percent of monthly balance paid in full (0 to 1) |
| `TENURE` | Integer | Service tenure with the financial institution (months) |

---

## System Architecture and API Reference

The backend exposes clean REST endpoints via FastAPI:

### Endpoints

#### 1. `GET /api/data`
Fetches global dataset statistics, eligible feature list, and initial row samples.

- **Response Format**:
  ```json
  {
    "columns": ["CUST_ID", "BALANCE", ...],
    "features": ["BALANCE", "PURCHASES", ...],
    "total_records": 8950,
    "summary": { ... },
    "samples": [ ... ]
  }
  ```

#### 2. `POST /api/cluster`
Performs K-Means clustering according to client-selected parameters.

- **Request Body**:
  ```json
  {
    "features": ["BALANCE", "PURCHASES", "CREDIT_LIMIT"],
    "k": 5,
    "normalise": true
  }
  ```
- **Response Format**:
  ```json
  {
    "records": [ ... ],
    "centroids": [ ... ],
    "profiles": [ ... ],
    "wcss": 12845.2,
    "silhouette": 0.42,
    "elbow_data": [
      { "k": 2, "wcss": 45120.3, "silhouette": 0.38 },
      { "k": 3, "wcss": 28340.1, "silhouette": 0.44 },
      ...
    ]
  }
  ```

#### 3. `GET /`
Serves the single-page application dashboard located in the `static/` directory.

---

## Project Directory Structure

```
clustering/
|-- .gitignore                  # Excludes venv, cache, and system files
|-- CC_GENERAL.csv              # Credit card customer dataset
|-- Mall_Customers.csv          # Supplementary customer segmentation dataset
|-- README.md                   # Technical documentation
|-- main.py                     # FastAPI server, data routes, and ML clustering logic
|-- requirements.txt            # Python dependencies
`-- static/                     # Frontend static assets
    |-- app.js                  # Client application logic, Plotly charts, Chart.js
    |-- index.html              # Dashboard layout and structure
    `-- styles.css              # Glassmorphic UI theme and styling rules
```

---

## Installation and Setup

### Prerequisites
- Python 3.9, 3.10, 3.11, or 3.12
- Git
- Modern web browser (Chrome, Safari, Firefox, Edge)

### Step-by-Step Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/Operator-X/CreditCard-K-means.git
   cd CreditCard-K-means
   ```

2. **Create and activate a virtual environment**:
   - On macOS and Linux:
     ```bash
     python3 -m venv venv
     source venv/bin/activate
     ```
   - On Windows:
     ```bash
     python -m venv venv
     venv\Scripts\activate
     ```

3. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

---

## Running the Application

1. **Start the server**:
   ```bash
   python3 main.py
   ```
   Or run directly with Uvicorn:
   ```bash
   uvicorn main:app --host 127.0.0.1 --port 8000 --reload
   ```

2. **Access the dashboard**:
   Navigate to `http://127.0.0.1:8000` in your web browser.

3. **Workflow**:
   - Select 2 or 3 features from the left sidebar panel.
   - Adjust the number of clusters (K) using the slider.
   - Toggle feature standardization according to your modeling requirements.
   - Click "Run Clustering" to execute the segmentation pipeline.
   - Analyze the 2D/3D scatter visualization, inspect cluster breakdown cards, examine the Elbow and Silhouette curves, and download the tagged cohort data via the "Export CSV" button.

---

## Technology Stack

- **Backend Framework**: FastAPI, Uvicorn
- **Machine Learning and Data Processing**: Scikit-Learn, Pandas, NumPy
- **Frontend Architecture**: HTML5, Vanilla CSS3 (Glassmorphic design system), ES6+ JavaScript
- **Visualizations**: Plotly.js (2D and 3D scatter plots), Chart.js (Elbow inertia curve and Silhouette evaluation)
