"""Project CAD lower-panel and wheel bounds into the login illustration.

uv run --with numpy --with opencv-python-headless python tools/generate_auth_chassis.py <cad_final.json>
The depth buffer resolves cap/tread/panel occlusion before vector contours are emitted.
"""
import argparse
import json
from pathlib import Path
import numpy as np
import cv2

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('manifest', type=Path)
args = parser.parse_args()
manifest = json.loads(args.manifest.read_text())
records = next(v for v in manifest.values() if isinstance(v, list) and v and isinstance(v[0], dict) and 'cad_bounds_mm' in v[0])
bounds = {r['name']: np.array(r['cad_bounds_mm']) for r in records}
# Match the existing cabinet edge projection; CAD millimetres remain common to all parts.
projection = np.array([[152 / 506, -82 / 400, 0], [-28 / 506, -36 / 400, -.27]])
origin = np.array([-253, 200, 172])
view = -np.cross(*projection)
view /= np.linalg.norm(view)
scale = 6
left, top, width, height = -50, 240, 340, 165
zbuffer = np.full((height * scale, width * scale), -np.inf)
labels = np.zeros(zbuffer.shape, np.uint8)
materials = {}

def project(points):
    return (np.asarray(points) - origin) @ projection.T + [0, 278]

def triangle(points, label):
    p = np.asarray(points)
    normal = np.cross(p[1] - p[0], p[2] - p[0])
    if normal @ view <= 0:
        return
    q = (project(p) - [left, top]) * scale
    low = np.maximum(np.floor(q.min(axis=0)).astype(int), 0)
    high = np.minimum(np.ceil(q.max(axis=0)).astype(int), [width * scale - 1, height * scale - 1])
    if np.any(high < low):
        return
    xx, yy = np.meshgrid(np.arange(low[0], high[0] + 1) + .5, np.arange(low[1], high[1] + 1) + .5)
    a, b, c = q
    denominator = (b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
    if abs(denominator) < 1e-8:
        return
    u = ((b[1]-c[1])*(xx-c[0])+(c[0]-b[0])*(yy-c[1])) / denominator
    v = ((c[1]-a[1])*(xx-c[0])+(a[0]-c[0])*(yy-c[1])) / denominator
    w = 1-u-v
    depth = np.array(p @ view)
    zz = u*depth[0]+v*depth[1]+w*depth[2]
    region = np.s_[low[1]:high[1]+1, low[0]:high[0]+1]
    update = (u >= 0) & (v >= 0) & (w >= 0) & (zz > zbuffer[region])
    zbuffer[region][update] = zz[update]
    labels[region][update] = label

def quad(points, label, outward):
    p = np.asarray(points)
    if np.cross(p[1]-p[0], p[2]-p[0]) @ outward < 0:
        p = p[::-1]
    triangle(p[[0,1,2]],label)
    triangle(p[[0,2,3]],label)

for i, (name, normal) in enumerate([
    ('FomexFrontLowerMountCut', [0,-1,0]), ('FomexLeftLowerMountCut', [-1,0,0]),
    ('FomexRightLowerMountCut', [1,0,0]), ('FomexBackLowerMountCut', [0,1,0]),
], 1):
    x0,y0,z0,x1,y1,z1 = bounds[name]
    if normal[0]:
        x = x0 if normal[0] < 0 else x1
        corners = [[x,y0,z0],[x,y1,z0],[x,y1,z1],[x,y0,z1]]
    else:
        y = y0 if normal[1] < 0 else y1
        corners = [[x0,y,z0],[x1,y,z0],[x1,y,z1],[x0,y,z1]]
    materials[i] = ('front-panel' if i == 1 else 'side-panel', 'panel' if i == 1 else 'background')
    quad(corners,i,np.array(normal))

for index, name in enumerate(n for n in bounds if n.startswith('Drive_') and n.endswith('_wheel')):
    x0,y0,z0,x1,y1,z1 = bounds[name]
    cy,cz = (y0+y1)/2,(z0+z1)/2
    # Omit the far rear wheel from this three-wheel illustration.
    if x0 > 0 and cy > 0:
        continue
    radius = (z1-z0)/2
    angles = np.linspace(0, 2*np.pi, 193)
    rings = [np.column_stack([np.full(len(angles), x), cy+radius*np.cos(angles), cz+radius*np.sin(angles)]) for x in [x0,x1]]
    cap, tread = 10+index*2, 11+index*2
    materials[cap] = (name+'-cap', 'tire')
    materials[tread] = (name+'-tread', 'tire')
    for j in range(len(angles)-1):
        # The negative-X cap faces the viewer on both sides of the chassis.
        triangle([[x0,cy,cz],rings[0][j+1],rings[0][j]],cap)
        quad([rings[0][j],rings[1][j],rings[1][j+1],rings[0][j+1]],tread,
             np.array([0,np.cos((angles[j]+angles[j+1])/2),np.sin((angles[j]+angles[j+1])/2)]))

paths = []
for label,(name,finish) in materials.items():
    contours,_ = cv2.findContours((labels == label).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    for contour in contours:
        if cv2.contourArea(contour) < 8:
            continue
        points = cv2.approxPolyDP(contour,1.2,True).reshape(-1,2) / scale + [left+.5/scale,top+.5/scale]
        d = 'M'+' '.join(f'{x:.2f},{y:.2f}' for x,y in points)+'Z'
        paths.append((name,finish,d))
fills = {'background':'var(--color-auth-background)', 'panel':'color-mix(in srgb, var(--color-illustration-fill) 65%, var(--color-auth-background))', 'tire':'var(--color-illustration-fill)'}
output = Path('apps/dashboard/src/auth/CadLowerAssembly.tsx')
lines = [f'/** CAD lower assembly: {manifest["source_name"]}, SHA-256 {manifest["source_sha256"]}.',
         ' * Regenerate with tools/generate_auth_chassis.py; depth-tested parallel-projection contours.',
         ' */', 'export function CadLowerAssembly() {', '  return <g data-robot-part="cad-lower-assembly">']
for name,finish,d in paths:
    lines.append(f'    <path data-cad-part="{name}" fill="{fills[finish]}" d="{d}" />')
lines.extend(['  </g>;', '}', ''])
output.write_text('\n'.join(lines))
print(f'{len(paths)} visible regions; {output.stat().st_size} bytes; {output}')
