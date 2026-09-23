import os
from typing import List, Dict, Any
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel
import pandas as pd
import numpy as np
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import silhouette_score

app = FastAPI(title="Credit Card Customer Segmentation Clustering API")

# Check if dataset exists
CSV_PATH = "CC_GENERAL.csv"
if not os.path.exists(CSV_PATH):
    raise FileNotFoundError(f"Required dataset '{CSV_PATH}' not found in the workspace directory.")

def get_clean_data() -> pd.DataFrame:
    """Loads dataset and standardizes/imputes missing values."""
    df = pd.read_csv(CSV_PATH)
    
    # Impute missing values with column medians
    if "CREDIT_LIMIT" in df.columns:
        df["CREDIT_LIMIT"] = df["CREDIT_LIMIT"].fillna(df["CREDIT_LIMIT"].median())
    if "MINIMUM_PAYMENTS" in df.columns:
        df["MINIMUM_PAYMENTS"] = df["MINIMUM_PAYMENTS"].fillna(df["MINIMUM_PAYMENTS"].median())
        
    return df

class ClusterRequest(BaseModel):
    features: List[str]
    k: int
    normalise: bool = True

def get_cluster_name(centroid: dict, overall_means: dict, features: List[str]) -> str:
    """Dynamically determines a friendly credit card segment name based on centroids."""
    balance_col = "BALANCE"
    purchases_col = "PURCHASES"
    cash_advance_col = "CASH_ADVANCE"
    credit_limit_col = "CREDIT_LIMIT"
    
    # Heuristics for the classic two features: Balance and Purchases
    if balance_col in features and purchases_col in features:
        bal = centroid[balance_col]
        pur = centroid[purchases_col]
        bal_mean = overall_means[balance_col]
        pur_mean = overall_means[purchases_col]
        
        bal_high = bal > bal_mean * 1.15
        bal_low = bal < bal_mean * 0.85
        pur_high = pur > pur_mean * 1.15
        pur_low = pur < pur_mean * 0.85
        
        if bal_high and pur_high:
            return "Active VIPs (High Balance, High Purchases)"
        elif bal_high and pur_low:
            # Check cash advance context if available
            cash_val = centroid.get(cash_advance_col, 0)
            cash_mean = overall_means.get(cash_advance_col, 1)
            if cash_val > cash_mean * 1.2:
                return "Borrowers (High Cash Advances & Balance)"
            return "Wealthy Savers (High Balance, Low Spend)"
        elif bal_low and pur_high:
            return "Frugal Shoppers (Low Balance, High Spend)"
        elif bal_low and pur_low:
            return "Inactive/Budget (Low Balance & Spend)"
        else:
            return "Standard Account Holders"
            
    # Generic naming if other features are selected
    name_parts = []
    for feat in features:
        val = centroid[feat]
        mean = overall_means[feat]
        feat_short = feat.replace("_", " ").title()
        if val > mean * 1.15:
            name_parts.append(f"High {feat_short}")
        elif val < mean * 0.85:
            name_parts.append(f"Low {feat_short}")
        else:
            name_parts.append(f"Mid {feat_short}")
            
    return " & ".join(name_parts) + " Users"

@app.get("/api/data")
def get_data_metadata():
    try:
        df = get_clean_data()
        
        # Summary statistics
        summary = df.describe().to_dict()
        
        # Sample of records (first 15 rows)
        samples = df.head(15).to_dict(orient="records")
        
        # Exclude Customer ID from selectable features
        features = [col for col in df.columns if col not in ["CUST_ID"]]
        
        return {
            "columns": list(df.columns),
            "features": features,
            "total_records": len(df),
            "summary": summary,
            "samples": samples
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/cluster")
def perform_clustering(req: ClusterRequest):
    try:
        df = get_clean_data()
        features = req.features
        k = req.k
        
        if len(features) < 2:
            raise HTTPException(status_code=400, detail="Please select at least 2 features for clustering.")
            
        # Get overall means for profile calculations
        overall_means = {feat: float(df[feat].mean()) for feat in features}
        
        # Extract features for clustering
        X = df[features].copy()
        
        # Scale if requested
        if req.normalise:
            scaler = StandardScaler()
            X_scaled = scaler.fit_transform(X)
        else:
            X_scaled = X.values
            
        # Perform K-Means
        kmeans = KMeans(n_clusters=k, random_state=42, n_init=10)
        df["Cluster"] = kmeans.fit_predict(X_scaled)
        
        # Compute Silhouette Score on a subset if dataset is too large, but 9k is small enough
        if k > 1:
            # Let's take a sample of 3000 records for silhouette to keep response fast (scikit-learn silhouette is O(N^2))
            if len(X_scaled) > 3000:
                indices = np.random.RandomState(42).choice(len(X_scaled), 3000, replace=False)
                silhouette = float(silhouette_score(X_scaled[indices], df["Cluster"].iloc[indices]))
            else:
                silhouette = float(silhouette_score(X_scaled, df["Cluster"]))
        else:
            silhouette = 0.0
            
        # Compute WCSS (Inertia)
        wcss = float(kmeans.inertia_)
        
        # Generate Cluster Profiles and Centroids
        centroids = []
        cluster_profiles = {}
        
        for cluster_id in range(k):
            cluster_data = df[df["Cluster"] == cluster_id]
            centroid_data = {}
            for col in features:
                centroid_data[col] = float(cluster_data[col].mean())
                
            cluster_name = get_cluster_name(centroid_data, overall_means, features)
            
            cluster_profiles[int(cluster_id)] = {
                "id": int(cluster_id),
                "name": cluster_name,
                "size": int(len(cluster_data)),
                "percentage": float((len(cluster_data) / len(df)) * 100),
                "centroids": centroid_data,
                "avg_balance": float(cluster_data["BALANCE"].mean()) if "BALANCE" in df.columns else 0.0,
                "avg_purchases": float(cluster_data["PURCHASES"].mean()) if "PURCHASES" in df.columns else 0.0,
                "avg_credit_limit": float(cluster_data["CREDIT_LIMIT"].mean()) if "CREDIT_LIMIT" in df.columns else 0.0
            }
            
            centroids.append({
                "cluster_id": int(cluster_id),
                "name": cluster_name,
                **centroid_data
            })
            
        # Compute Elbow Curve Data (WCSS and Silhouette for K=2 to 10)
        # Using a subset of 3000 for silhouette curve computation for speed
        elbow_data = []
        for i in range(2, 11):
            temp_kmeans = KMeans(n_clusters=i, random_state=42, n_init=10)
            temp_labels = temp_kmeans.fit_predict(X_scaled)
            temp_wcss = float(temp_kmeans.inertia_)
            
            if len(X_scaled) > 3000:
                indices = np.random.RandomState(42).choice(len(X_scaled), 3000, replace=False)
                temp_sil = float(silhouette_score(X_scaled[indices], temp_labels[indices]))
            else:
                temp_sil = float(silhouette_score(X_scaled, temp_labels))
                
            elbow_data.append({
                "k": i,
                "wcss": temp_wcss,
                "silhouette": temp_sil
            })
            
        # Prepare records to return
        records = df.to_dict(orient="records")
        for record in records:
            c_id = record["Cluster"]
            record["ClusterName"] = cluster_profiles[c_id]["name"]
            
        return {
            "records": records,
            "centroids": centroids,
            "profiles": list(cluster_profiles.values()),
            "wcss": wcss,
            "silhouette": silhouette,
            "elbow_data": elbow_data
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Mount static folder for serving frontend
os.makedirs("static", exist_ok=True)
app.mount("/", StaticFiles(directory="static", html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
