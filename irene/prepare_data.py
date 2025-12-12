import pandas as pd
import json
from pathlib import Path

meta_path = Path("data/biotime_v2_metadata_2025.csv")
meta = pd.read_csv(meta_path)

# garde les colonnes utiles
cols = [
    "STUDY_ID",
    "REALM",
    "CLIMATE",          
    "TAXA",
    "CEN_LATITUDE",
    "CEN_LONGITUDE",
    "HABITAT",
    "PROTECTED_AREA",
    "START_YEAR",
    "END_YEAR",
    "NUMBER_OF_SPECIES",
    "NUMBER_OF_SAMPLES",
    "ABUNDANCE_TYPE"]
meta = meta[cols].dropna(subset=["CEN_LATITUDE", "CEN_LONGITUDE"])

# durée de l’étude
meta["STUDY_DURATION"] = meta["END_YEAR"] - meta["START_YEAR"] + 1

# pour le JavaScript, on convertit chaque ligne en dict propre
records = []
for _, row in meta.iterrows():
    records.append({
        "study_id": int(row["STUDY_ID"]),
        "realm": str(row["REALM"]),
        "climate" : str(row["CLIMATE"]),
        "taxa": str(row["TAXA"]),
        "lat": float(row["CEN_LATITUDE"]),
        "lon": float(row["CEN_LONGITUDE"]),
        "habitat" : str(row["HABITAT"]),
        "protected_area" : str(row["PROTECTED_AREA"]),
        "start_year": int(row["START_YEAR"]),
        "end_year": int(row["END_YEAR"]),
        "duration": int(row["STUDY_DURATION"]),
        "number_species" : int(row["NUMBER_OF_SPECIES"]),
        "number_samples" : int(row["NUMBER_OF_SAMPLES"]),
        "abundance_type": str(row["ABUNDANCE_TYPE"])
    })

out_path = Path("data/studies.json")
out_path.write_text(json.dumps(records, indent=2), encoding="utf-8")
print(f"Écrit {len(records)} études dans {out_path}")
