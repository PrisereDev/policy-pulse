import requests

NFHL_URL = "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query"
GEOCODER = "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates"

LEARN_MORE_URL = "https://agents.floodsmart.gov/articles/flood-maps-and-zones"


# ---------------------------
# Geocode Address
# ---------------------------
def geocode(address):
    params = {
        "SingleLine": address,
        "f": "json",
        "maxLocations": 1
    }

    r = requests.get(GEOCODER, params=params, timeout=5)
    r.raise_for_status()
    data = r.json()

    if not data.get("candidates"):
        raise ValueError("Address not found")

    loc = data["candidates"][0]["location"]
    return loc["y"], loc["x"]  # lat, lon


# ---------------------------
# Query FEMA Flood Hazard Layer
# ---------------------------
def query_fema(lat, lon):
    params = {
        "geometry": f"{lon},{lat}",
        "geometryType": "esriGeometryPoint",
        "inSR": 4326,
        "spatialRel": "esriSpatialRelIntersects",
        "outFields": "FLD_ZONE,SFHA_TF,ZONE_SUBTY",
        "returnGeometry": "false",
        "f": "json"
    }

    r = requests.get(NFHL_URL, params=params, timeout=5)
    r.raise_for_status()
    data = r.json()

    features = data.get("features", [])
    if not features:
        return None

    return features[0]["attributes"]


# ---------------------------
# Translate FEMA Zone → User-Friendly Risk
# ---------------------------
def risk_profile(zone):
    if not zone:
        return {
            "risk_level": "Unknown",
            "summary": "Flood risk could not be determined.",
            "insurance_required": False
        }

    zone = zone.upper().strip()

    # High Risk (SFHA)
    if zone.startswith(("A", "V")):
        return {
            "risk_level": "High",
            "summary": (
                "This property is located in a high-risk flood area "
                "with a 1% annual chance of flooding (also known as the 100-year flood zone). "
                "Flood insurance is typically required for federally backed mortgages."
            ),
            "insurance_required": True
        }

    # Moderate / Low Risk
    if zone == "X":
        return {
            "risk_level": "Moderate/Low",
            "summary": (
                "This property is located in a moderate-to-low flood risk area. "
                "Flood insurance is not federally required but is recommended."
            ),
            "insurance_required": False
        }

    # Undetermined
    if zone == "D":
        return {
            "risk_level": "Undetermined",
            "summary": (
                "Flood risk for this property has not been fully determined."
            ),
            "insurance_required": False
        }

    return {
        "risk_level": "Unknown",
        "summary": "Flood zone classification unclear.",
        "insurance_required": False
    }


# ---------------------------
# Main Lookup Function
# ---------------------------
def lookup(address):
    try:
        lat, lon = geocode(address)
        result = query_fema(lat, lon)

        # Outside FEMA coverage
        if result is None:
            return {
                "address": address,
                "coordinates": {
                    "lat": lat,
                    "lon": lon
                },
                "flood_zone": "OUTSIDE_DATA_COVERAGE",
                "sfha": False,
                "risk_level": "Unknown",
                "summary": "This property is outside FEMA flood hazard coverage areas.",
                "insurance_required": False,
                "learn_more_url": LEARN_MORE_URL
            }

        zone = result.get("FLD_ZONE")
        sfha_flag = result.get("SFHA_TF") == "T"

        risk = risk_profile(zone)

        return {
            "address": address,
            "coordinates": {
                "lat": lat,
                "lon": lon
            },
            "flood_zone": zone,
            "sfha": sfha_flag,
            "risk_level": risk["risk_level"],
            "summary": risk["summary"],
            "insurance_required": risk["insurance_required"],
            "learn_more_url": LEARN_MORE_URL
        }

    except Exception as e:
        return {
            "address": address,
            "flood_zone": None,
            "sfha": False,
            "risk_level": "Unknown",
            "summary": "An error occurred while retrieving flood information.",
            "insurance_required": False,
            "error": str(e),
            "learn_more_url": LEARN_MORE_URL
        }
