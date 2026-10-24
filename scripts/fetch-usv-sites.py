"""Fetch small, reproducible OSM source snapshots. Run explicitly; never at app runtime."""
from pathlib import Path
import argparse
import requests
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
SITES = {
    "westlake": (120.130, 30.226, 120.163, 30.254),
    "kallang": (103.855, 1.291, 103.883, 1.317),
    "waalhaven": (4.417, 51.867, 4.464, 51.899),
}

parser = argparse.ArgumentParser()
parser.add_argument("site", choices=SITES)
args = parser.parse_args()
target = ROOT / "public/assets" / args.site
target.mkdir(parents=True, exist_ok=True)
elements = {}
urls = []
def fetch_map(bounds, depth=0):
    url = 'https://api.openstreetmap.org/api/0.6/map?bbox=' + ','.join(map(str, bounds))
    response = requests.get(url, timeout=90)
    if response.status_code == 400 and 'too many nodes' in response.text and depth < 5:
        west, south, east, north = bounds
        if depth % 2 == 0:
            middle = (west + east) / 2
            fetch_map((west, south, middle, north), depth + 1)
            fetch_map((middle, south, east, north), depth + 1)
        else:
            middle = (south + north) / 2
            fetch_map((west, south, east, middle), depth + 1)
            fetch_map((west, middle, east, north), depth + 1)
        return
    response.raise_for_status()
    xml = ET.fromstring(response.content)
    urls.append(url)
    for e in xml:
        if e.tag in ('node', 'way', 'relation'):
            elements[e.tag, e.get('id')] = e
    print(f'{args.site}: {len(response.content):,} bytes from {url}', flush=True)

fetch_map(SITES[args.site])
# Map extracts include relation headers but not all their members. Complete water
# multipolygons before clipping, so no missing members silently become land.
water_relations = [e for e in elements.values() if e.tag == 'relation' and any(
    t.get('k') == 'natural' and t.get('v') == 'water' for t in e.findall('tag'))]
for relation in water_relations:
    members = [m for m in relation.findall('member') if m.get('type') == 'way']
    if all(('way', m.get('ref')) in elements for m in members):
        continue
    url = f'https://api.openstreetmap.org/api/0.6/relation/{relation.get("id")}/full'
    response = requests.get(url, timeout=90)
    response.raise_for_status()
    for e in ET.fromstring(response.content):
        if e.tag in ('node', 'way', 'relation'):
            elements[e.tag, e.get('id')] = e
    urls.append(url)
    print(f'completed water relation {relation.get("id")}', flush=True)
xml = ET.Element('osm', version='0.6', generator='fetch-usv-sites.py; merged OSM API snapshots',
                 attribution='OpenStreetMap contributors', license='https://opendatacommons.org/licenses/odbl/1-0/')
xml.extend(sorted(elements.values(), key=lambda e: (e.tag, int(e.get('id')))))
ET.ElementTree(xml).write(target / 'site.osm', encoding='utf-8', xml_declaration=True)
(target / 'download-urls.txt').write_text('\n'.join(urls) + '\n', encoding='utf-8')
