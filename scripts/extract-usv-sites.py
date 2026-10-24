"""Build three local USV scenes from OSM snapshots; no runtime network or GIS dependency.

Offline dependencies: shapely >= 2, pyproj. Coordinates use local UTM metres,
X east, -Z north. Heights without OSM height tags are explicitly approximate.
"""
from pathlib import Path
import json
import math
import sys
import xml.etree.ElementTree as ET
from pyproj import Transformer
from shapely import Polygon, LineString, box, make_valid
from shapely.ops import unary_union, polygonize

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parents[1]
SITES = {
    "westlake": dict(name="杭州西湖 · 三岛水域", lon=120.1455, lat=30.2402, crs=32651, width=2400, depth=2500, bank=2.2, building=6),
    "kallang": dict(name="新加坡 · 加冷盆地", lon=103.8686, lat=1.3040, crs=32648, width=2200, depth=2200, bank=2.5, building=14),
    "waalhaven": dict(name="鹿特丹 · 瓦尔港", lon=4.4415, lat=51.8830, crs=32631, width=2800, depth=3000, bank=3.2, building=12),
}

def polygons(geometry):
    if geometry.is_empty:
        return []
    if geometry.geom_type == "Polygon":
        return [geometry]
    return [p for g in getattr(geometry, "geoms", []) for p in polygons(g)]

def encode_polygon(p):
    ring = lambda r: [[round(x, 3), round(z, 3)] for x, z in list(r.coords)[:-1]]
    return dict(outer=ring(p.exterior), holes=[ring(r) for r in p.interiors])

def tags(e):
    return {t.get("k"): t.get("v") for t in e.findall("tag")}

def numeric(value, default):
    try:
        result = float(str(value).replace(" m", ""))
        return result if math.isfinite(result) and result > 0 else default
    except (TypeError, ValueError):
        return default

for site, cfg in SITES.items():
    folder = ROOT / "public/assets" / site
    xml = ET.parse(folder / "site.osm").getroot()
    nodes = {n.get("id"): n for n in xml.findall("node")}
    ways = {w.get("id"): w for w in xml.findall("way")}
    relations = {r.get("id"): r for r in xml.findall("relation")}
    project = Transformer.from_crs(4326, cfg["crs"], always_xy=True)
    origin_e, origin_n = project.transform(cfg["lon"], cfg["lat"])
    bounds = box(-cfg["width"] / 2, -cfg["depth"] / 2, cfg["width"] / 2, cfg["depth"] / 2)
    used = set()
    def points(w):
        result = []
        for nd in w.findall("nd"):
            n = nodes[nd.get("ref")]
            e, north = project.transform(float(n.get("lon")), float(n.get("lat")))
            result.append((e - origin_e, origin_n - north))
        return result

    def geometry(e, strict=False):
        if e.tag == "way":
            p = points(e)
            if len(p) < 4 or p[0] != p[-1]:
                return Polygon()
            return make_valid(Polygon(p))
        shells, holes = [], []
        for m in e.findall("member"):
            if m.get("type") != "way":
                continue
            w = ways.get(m.get("ref"))
            if w is None:
                if strict:
                    raise ValueError(f"{site}: missing way {m.get('ref')} in water relation {e.get('id')}")
                return Polygon()
            (holes if m.get("role") == "inner" else shells).append(LineString(points(w)))
        outer = list(polygonize(shells))
        if strict and not outer:
            raise ValueError(f"{site}: unclosed water relation {e.get('id')}")
        return make_valid(unary_union([make_valid(p) for p in outer]).difference(
            unary_union([make_valid(p) for p in polygonize(holes)])))

    def retain(e):
        used.add((e.tag, e.get("id")))
        if e.tag == "relation":
            for m in e.findall("member"):
                if m.get("type") == "way" and m.get("ref") in ways:
                    retain(ways[m.get("ref")])
        elif e.tag == "way":
            used.update(("node", n.get("ref")) for n in e.findall("nd"))

    # Assemble all water first. Union prevents seams at separately mapped river segments.
    water_parts, water_sources = [], []
    for e in [*relations.values(), *ways.values()]:
        t = tags(e)
        if t.get("natural") != "water" and t.get("waterway") != "riverbank":
            continue
        p = geometry(e, strict=True).intersection(bounds)
        if p.area < 20:
            continue
        water_parts.append(p)
        water_sources.append(dict(type=e.tag, id=e.get("id"), name=t.get("name", "")))
        retain(e)
    water = make_valid(unary_union(water_parts)).simplify(.2, preserve_topology=True)
    assert water.area > 100_000, f"{site}: unexpectedly little mapped water"
    land = make_valid(bounds.difference(water))

    features = {"buildings": [], "green": [], "roads": [], "structures": []}
    for e in [*ways.values(), *relations.values()]:
        t = tags(e)
        category = None
        properties = {}
        if "building" in t and t["building"] != "no":
            category = "buildings"
            h = numeric(t.get("height"), 0)
            floors = numeric(t.get("building:levels"), 0)
            properties = dict(height=h or (floors * 3.2 if floors else cfg["building"]),
                              heightBasis="osm-height" if h else "levels-estimate" if floors else "display-estimate")
            p = geometry(e).intersection(land)
        elif t.get("man_made") in ("pier", "bridge") or (t.get("bridge") not in (None, "no") and "highway" in t):
            category = "structures"
            kind = "pier" if t.get("man_made") == "pier" else "bridge"
            properties = dict(kind=kind, height=1.2 if kind == "pier" else 7,
                              heightBasis="display-estimate", clearanceVerified=False)
            p = geometry(e)
            if p.is_empty and e.tag == "way":
                width = numeric(t.get("width"), 3 if t.get("highway") in ("footway", "path", "cycleway") else 10)
                p = LineString(points(e)).buffer(width / 2, cap_style=2, join_style=2)
            p = p.intersection(bounds)
            if p.intersection(water).area < 1:
                continue
        elif "highway" in t and e.tag == "way" and t.get("tunnel") not in ("yes", "building_passage"):
            if t.get("highway") in ("construction", "proposed", "steps", "platform"):
                continue
            category = "roads"
            pedestrian = t["highway"] in ("path", "footway", "cycleway", "pedestrian", "track")
            properties = dict(pedestrian=pedestrian)
            width = numeric(t.get("width"), 3 if pedestrian else 7)
            p = LineString(points(e)).buffer(min(width, 35) / 2, cap_style=2, join_style=2).intersection(land)
        elif t.get("landuse") in ("forest", "grass", "meadow") or t.get("natural") in ("wood", "scrub") or t.get("leisure") in ("park", "garden"):
            category = "green"
            p = geometry(e).intersection(land)
        else:
            continue
        parts = [g.simplify(.3, preserve_topology=True) for g in polygons(make_valid(p)) if g.area > (8 if category == "buildings" else 2)]
        if not parts:
            continue
        retain(e)
        for i, p in enumerate(parts):
            features[category].append(dict(id=f"{e.tag}-{e.get('id')}-{i}", osmType=e.tag, osmId=e.get("id"),
                name=t.get("name:zh", t.get("name", "")), polygon=encode_polygon(p), **properties))

    # Persist exactly the OSM objects supporting this derived database. No unrelated
    # POIs, addresses, transit routes or administrative boundaries are distributed.
    retained = ET.Element("osm", version="0.6", generator="extract-usv-sites.py; filtered OSM API snapshot",
                          attribution="OpenStreetMap contributors", license="https://opendatacommons.org/licenses/odbl/1-0/")
    tables = {"node": nodes, "way": ways, "relation": relations}
    for kind, identity in sorted(used, key=lambda key: (key[0], int(key[1]))):
        retained.append(tables[kind][identity])
    ET.ElementTree(retained).write(folder / "site.osm", encoding="utf-8", xml_declaration=True)
    data = dict(variant=site, origin=dict(latitude=cfg["lat"], longitude=cfg["lon"], crs=f"EPSG:{cfg['crs']}",
                easting=origin_e, northing=origin_n, axes="+X grid east, -Z grid north, Y up"),
                width=cfg["width"], depth=cfg["depth"], bankHeight=cfg["bank"],
                water=[encode_polygon(p) for p in polygons(water)], land=[encode_polygon(p) for p in polygons(land)],
                waterSources=water_sources, **features)
    encoded = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    (folder / "layout.json").write_text(encoded + "\n", encoding="utf-8")
    out = ROOT / "src/environments/usv-sites/data"
    out.mkdir(parents=True, exist_ok=True)
    (out / f"{site}.ts").write_text('// Generated by scripts/extract-usv-sites.py. © OpenStreetMap contributors, ODbL 1.0.\n'
        + 'import type { SiteSurvey } from "../types";\nexport const survey: SiteSurvey = ' + encoded + ';\n', encoding="utf-8")
    print(site, {key: len(data[key]) for key in ("water", "land", "buildings", "green", "roads", "structures")},
          "water m²", round(water.area), "source bytes", (folder / "site.osm").stat().st_size)
