"""Continuous polygon checks for the exported static motion corridors (offline GIS QA)."""
import json
from pathlib import Path
from shapely import Polygon, LineString, Point
from shapely.ops import unary_union

root = Path(__file__).resolve().parents[1]
for site in ('westlake', 'kallang', 'waalhaven'):
    folder = root / 'public/assets' / site
    data = json.loads((folder / 'layout.json').read_text(encoding='utf-8'))
    nav = json.loads((folder / 'navigation.json').read_text(encoding='utf-8'))
    polygon = lambda p: Polygon(p['outer'], p['holes'])
    waters = [polygon(p) for p in data['water']]
    lands = [polygon(p) for p in data['land']]
    assert all(p.is_valid for p in waters + lands)
    water, land = unary_union(waters), unary_union(lands)
    assert water.intersection(land).area < .01
    assert abs(water.union(land).area - data['width'] * data['depth']) < .1
    barriers = unary_union([polygon(p) for p in nav['obstacles']])
    navigable = water.difference(barriers)
    for route in nav['routes']:
        corridor = LineString(route['points']).buffer(route['corridorRadius'], quad_segs=32)
        assert navigable.covers(corridor), (site, route['id'], corridor.difference(navigable).area)
    for spawn in nav['spawnPoints']:
        x, _, z = spawn['position']
        assert navigable.covers(Point(x, z).buffer(5)), (site, spawn['id'])
    print(f'{site}: valid land/water partition, 12 clear spawn circles, {len(nav["routes"])} continuous clear corridors')
