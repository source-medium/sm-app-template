"""Build local SVG paths from reviewed Natural Earth 5.1.1 archives.

Maintainer-only: uv run --no-project --with pyshp python scripts/build-geography-maps.py /path/to/archives
Download ne_110m_admin_{0_countries,1_states_provinces}.zip from the source URLs in assets/provenance.json.
No network, geometry dependencies, geocoding or filesystem access in the runtime app.
"""
import gzip
import hashlib
import json
from pathlib import Path
import sys
import zipfile
import shapefile

OUTPUT = Path(__file__).resolve().parents[1] / "src/features/geography/assets"


def project(lon, lat, code, kind):
    if kind == "countries":
        return (lon + 180) * 2, (90 - lat) * 2
    if code == "AK":
        lon = lon - 360 if lon > 0 else lon
        return 25 + (lon + 190) * 2.7, 245 + (72 - lat) * 2.7
    if code == "HI":
        return 235 + (lon + 161) * 7, 270 + (23 - lat) * 7
    return 20 + (lon + 125) * 11.5, 15 + (50 - lat) * 8.5


def build(directory):
    OUTPUT.mkdir(parents=True, exist_ok=True)
    provenance = []
    for kind, filename in [("countries", "ne_110m_admin_0_countries"), ("us-states", "ne_110m_admin_1_states_provinces")]:
        archive = directory / (filename + ".zip")
        paths, crosswalk = {}, {}
        with zipfile.ZipFile(archive) as zipped:
            version_file = next(name for name in zipped.namelist() if "VERSION" in name)
            version = zipped.read(version_file).decode().strip()
            if version != "5.1.1":
                raise ValueError("New boundary version requires review")
            reader = shapefile.Reader(shp=zipped.open(filename + ".shp"), shx=zipped.open(filename + ".shx"), dbf=zipped.open(filename + ".dbf"))
            for record in reader.iterShapeRecords():
                values = record.record.as_dict()
                code = values["ISO_A2_EH"] if kind == "countries" else values["postal"]
                if len(code) != 2 or not code.isalpha() or code != code.upper():
                    continue  # Unknown crosswalks are deliberately unmapped, not guessed.
                name = values["NAME_EN"] if kind == "countries" else values["name"]
                parts = list(record.shape.parts) + [len(record.shape.points)]
                rings = []
                for start, end in zip(parts, parts[1:]):
                    points = [project(lon, lat, code, kind) for lon, lat in record.shape.points[start:end]]
                    rings.append("M" + "L".join(f"{x:.1f},{y:.1f}" for x, y in points) + "Z")
                paths[code] = paths.get(code, "") + "".join(rings)
                crosswalk[code] = name
        geometry = json.dumps({"viewBox": "0 0 720 360", "paths": paths}, separators=(",", ":")) + "\n"
        (OUTPUT / (kind + ".json")).write_text(geometry)
        (OUTPUT / (kind + "-codes.json")).write_text(json.dumps(crosswalk, indent=2, sort_keys=True) + "\n")
        provenance.append({"asset": kind + ".json", "source": "https://naturalearth.s3.amazonaws.com/110m_cultural/" + archive.name, "version": version, "license": "Public domain", "license_url": "https://www.naturalearthdata.com/about/terms-of-use/", "source_sha256": hashlib.sha256(archive.read_bytes()).hexdigest(), "asset_sha256": hashlib.sha256(geometry.encode()).hexdigest(), "gzip_bytes": len(gzip.compress(geometry.encode(), mtime=0)), "projection": "Equirectangular lon/lat; US has separately scaled Alaska and Hawaii insets. Coordinates rounded to 0.1 SVG units.", "crosswalk": "ISO_A2_EH" if kind == "countries" else "postal where iso_a2=US", "codes": len(paths)})
    (OUTPUT / "provenance.json").write_text(json.dumps(provenance, indent=2) + "\n")
    print(json.dumps(provenance, indent=2))


if __name__ == "__main__":
    build(Path(sys.argv[1]))
