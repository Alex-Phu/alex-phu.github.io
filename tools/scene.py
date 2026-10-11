"""Build Alex's desk scene in Blender, bake lighting with Cycles, export desk.glb.

Usage: python3 scene.py OUTDIR [draft|final]
Blender axes: X right, Y back (away from the viewer), Z up. Units: meters.
"""
import bpy, bmesh, math, os, sys, time
import numpy as np
from mathutils import Vector, Matrix
from PIL import Image, ImageDraw, ImageFont
from scipy.ndimage import gaussian_filter

OUT = sys.argv[1]
MODE = sys.argv[2] if len(sys.argv) > 2 else 'draft'
os.makedirs(OUT, exist_ok=True)
TEX = os.path.join(OUT, 'tex'); os.makedirs(TEX, exist_ok=True)
if MODE == 'final':
    ALB_RES, LIGHT_RES, LIGHT_SAMPLES, ALB_SAMPLES = 2048, 1024, 160, 4
elif MODE == 'medium':
    ALB_RES, LIGHT_RES, LIGHT_SAMPLES, ALB_SAMPLES = 1024, 512, 40, 2
else:
    ALB_RES, LIGHT_RES, LIGHT_SAMPLES, ALB_SAMPLES = 512, 256, 24, 1

T0 = time.time()
def log(*a): print(f'[{time.time()-T0:6.1f}s]', *a, flush=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.max_bounces = 4
scene.cycles.diffuse_bounces = 4
scene.cycles.glossy_bounces = 0
scene.cycles.transmission_bounces = 0
scene.cycles.caustics_reflective = False
scene.cycles.caustics_refractive = False
COLL = scene.collection

# Optional GPU baking: python scene.py OUTDIR final gpu
if 'gpu' in sys.argv[3:]:
    found = False
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        for kind in ('OPTIX', 'CUDA', 'HIP', 'METAL', 'ONEAPI'):
            try:
                prefs.compute_device_type = kind
            except TypeError:
                continue
            prefs.get_devices()
            gpus = [d for d in prefs.devices if d.type == kind]
            if gpus:
                for d in prefs.devices: d.use = d.type == kind
                scene.cycles.device = 'GPU'
                log('baking on GPU:', kind, ', '.join(d.name for d in gpus))
                found = True
                break
    except Exception as e:
        log('GPU setup failed:', e)
    if not found: log('no supported GPU found, baking on CPU (slow)')
ZT = 0.77  # desk top height
R = math.radians

# ---------------------------------------------------------------- materials
def lin(hexstr):
    h = hexstr.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)

MATS = {}
def pmat(name, hexcol, rough=0.6):
    if name in MATS: return MATS[name]
    m = bpy.data.materials.new(name)
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*lin(hexcol), 1)
    b.inputs['Roughness'].default_value = rough
    MATS[name] = m
    return m

def node_mat(name, build):
    m = bpy.data.materials.new(name)
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    b.inputs['Roughness'].default_value = 0.6
    build(nt, b)
    MATS[name] = m
    return m

def image_mat(name, path, axes='XZ'):
    img = bpy.data.images.load(path)
    def build(nt, b):
        tc = nt.nodes.new('ShaderNodeTexCoord')
        sep = nt.nodes.new('ShaderNodeSeparateXYZ')
        com = nt.nodes.new('ShaderNodeCombineXYZ')
        tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = img
        nt.links.new(tc.outputs['Generated'], sep.inputs[0])
        nt.links.new(sep.outputs[axes[0]], com.inputs['X'])
        nt.links.new(sep.outputs[axes[1]], com.inputs['Y'])
        nt.links.new(com.outputs[0], tex.inputs['Vector'])
        nt.links.new(tex.outputs['Color'], b.inputs['Base Color'])
    return node_mat(name, build)

def wood_floor(nt, b):
    tc = nt.nodes.new('ShaderNodeTexCoord')
    brick = nt.nodes.new('ShaderNodeTexBrick')
    brick.inputs['Color1'].default_value = (*lin('#d8bd98'), 1)
    brick.inputs['Color2'].default_value = (*lin('#c9a983'), 1)
    brick.inputs['Mortar'].default_value = (*lin('#b39878'), 1)
    brick.inputs['Scale'].default_value = 1.0
    brick.inputs['Mortar Size'].default_value = 0.0018
    brick.inputs['Brick Width'].default_value = 1.1
    brick.inputs['Row Height'].default_value = 0.16
    brick.offset = 0.37
    mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (2.0, 60.0, 1.0)
    noise = nt.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 3.0
    noise.inputs['Detail'].default_value = 6.0
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = (0.86, 0.86, 0.86, 1)
    ramp.color_ramp.elements[1].color = (1.0, 1.0, 1.0, 1)
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'
    mix.inputs['Factor'].default_value = 1.0
    nt.links.new(tc.outputs['Object'], brick.inputs['Vector'])
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
    nt.links.new(mp.outputs[0], noise.inputs['Vector'])
    nt.links.new(noise.outputs['Fac'], ramp.inputs['Fac'])
    nt.links.new(brick.outputs['Color'], mix.inputs['A'])
    nt.links.new(ramp.outputs['Color'], mix.inputs['B'])
    nt.links.new(mix.outputs['Result'], b.inputs['Base Color'])

def noisy(base_hex, var=0.06, scale=40.0):
    def build(nt, b):
        tc = nt.nodes.new('ShaderNodeTexCoord')
        noise = nt.nodes.new('ShaderNodeTexNoise')
        noise.inputs['Scale'].default_value = scale
        noise.inputs['Detail'].default_value = 8.0
        ramp = nt.nodes.new('ShaderNodeValToRGB')
        c = lin(base_hex)
        ramp.color_ramp.elements[0].color = (*[x * (1 - var) for x in c], 1)
        ramp.color_ramp.elements[1].color = (*[min(1, x * (1 + var)) for x in c], 1)
        nt.links.new(tc.outputs['Object'], noise.inputs['Vector'])
        nt.links.new(noise.outputs['Fac'], ramp.inputs['Fac'])
        nt.links.new(ramp.outputs['Color'], b.inputs['Base Color'])
    return build

# ---------------------------------------------------------------- geometry helpers
def finalize(ob, smooth_angle=None):
    """Apply modifiers and shading so the object can be joined and unwrapped."""
    if ob.modifiers:
        dg = bpy.context.evaluated_depsgraph_get()
        me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
        old = ob.data
        ob.modifiers.clear()
        ob.data = me
        bpy.data.meshes.remove(old)
    if smooth_angle is not None:
        ob.data.shade_smooth()
        ob.data.set_sharp_from_angle(angle=R(smooth_angle))
    return ob

def make(name, bm, mat, loc=(0, 0, 0), rot=(0, 0, 0), bevel=0.0, seg=2, smooth=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me)
    COLL.objects.link(ob)
    if mat: me.materials.append(mat)
    ob.location = loc
    ob.rotation_euler = rot
    if bevel:
        m = ob.modifiers.new('bevel', 'BEVEL')
        m.width = bevel; m.segments = seg; m.limit_method = 'ANGLE'
        smooth = 35 if smooth is None else smooth
    return finalize(ob, smooth)

def bm_box(bm, size, loc=(0, 0, 0)):
    g = bmesh.ops.create_cube(bm, size=1.0)
    vs = g['verts']
    bmesh.ops.scale(bm, vec=Vector(size), verts=vs)
    bmesh.ops.translate(bm, vec=Vector(loc), verts=vs)
    return vs

def box(name, size, loc, mat, rot=(0, 0, 0), bevel=0.003, seg=2):
    bm = bmesh.new(); bm_box(bm, size)
    return make(name, bm, mat, loc, rot, bevel if min(size) > bevel * 2.5 else 0.0, seg)

def cyl(name, r, h, loc, mat, rot=(0, 0, 0), r2=None, verts=32, bevel=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=verts,
                          radius1=r, radius2=r if r2 is None else r2, depth=h)
    return make(name, bm, mat, loc, rot, bevel, smooth=40)

def sphere(name, r, loc, mat, scale=(1, 1, 1), rot=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=16, radius=r)
    bmesh.ops.scale(bm, vec=Vector(scale), verts=bm.verts)
    return make(name, bm, mat, loc, rot, smooth=80)

def lathe(name, prof, loc, mat, rot=(0, 0, 0), seg=40, angle=2 * math.pi):
    closed = abs(angle - 2 * math.pi) < 1e-6
    n = seg if closed else seg + 1
    bm = bmesh.new()
    rings = []
    for r, z in prof:
        rings.append([bm.verts.new((r * math.cos(angle * i / seg), r * math.sin(angle * i / seg), z)) for i in range(n)])
    for a, b in zip(rings, rings[1:]):
        for i in range(seg):
            j = (i + 1) % n if closed else i + 1
            bm.faces.new((a[i], a[j], b[j], b[i]))
    if not closed:
        bm.faces.new([ring[0] for ring in rings[:-1]][::-1])
        bm.faces.new([ring[-1] for ring in rings[:-1]])
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    return make(name, bm, mat, loc, rot, smooth=50)

def sweep(name, pts, radius, mat, closed=False, res=3):
    cu = bpy.data.curves.new(name, 'CURVE'); cu.dimensions = '3D'
    sp = cu.splines.new('POLY'); sp.points.add(len(pts) - 1)
    for p, c in zip(sp.points, pts): p.co = (c[0], c[1], c[2], 1)
    sp.use_cyclic_u = closed
    cu.bevel_depth = radius; cu.bevel_resolution = res; cu.use_fill_caps = True
    tmp = bpy.data.objects.new(name + '_c', cu); COLL.objects.link(tmp)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg))
    bpy.data.objects.remove(tmp); bpy.data.curves.remove(cu)
    ob = bpy.data.objects.new(name, me); COLL.objects.link(ob)
    me.materials.clear(); me.materials.append(mat)
    return finalize(ob, 60)

def smooth_path(ctrl, n=24):
    """Catmull-Rom through control points."""
    P = [Vector(p) for p in ctrl]
    out = []
    for i in range(len(P) - 1):
        p0 = P[max(i - 1, 0)]; p1 = P[i]; p2 = P[i + 1]; p3 = P[min(i + 2, len(P) - 1)]
        for k in range(n):
            t = k / n
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    out.append(P[-1])
    return [tuple(v) for v in out]

def join(objs, name, group, loc=None, rot_z=0.0):
    """Join parts into one object named `name`, then move/rotate the whole thing."""
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = name; ob.data.name = name
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if loc is not None or rot_z:
        ob.data.transform(Matrix.Translation(Vector(loc or (0, 0, 0))) @ Matrix.Rotation(rot_z, 4, 'Z'))
    ob['grp'] = group
    return ob

def tag(ob, group):
    ob['grp'] = group
    return ob

# ---------------------------------------------------------------- textures drawn with PIL
def font(size, bold=True, mono=False):
    f = 'DejaVuSansMono-Bold.ttf' if mono else ('DejaVuSans-Bold.ttf' if bold else 'DejaVuSans.ttf')
    try: return ImageFont.truetype(f'/usr/share/fonts/truetype/dejavu/{f}', size)
    except Exception: return ImageFont.load_default(size=size)

def draw_poster():
    W, H = 600, 800
    im = Image.new('RGB', (W, H), '#efe9dc'); d = ImageDraw.Draw(im)
    d.ellipse((150, 120, 450, 420), fill='#d9662f')
    for i in range(6): d.rectangle((60, 470 + i * 6, 540, 471 + i * 6), fill='#d9662f')
    d.text((W / 2, 560), 'BUILD TO', fill='#1d2725', font=font(64, mono=True), anchor='mm')
    d.text((W / 2, 640), 'UNDERSTAND', fill='#1d2725', font=font(64, mono=True), anchor='mm')
    d.text((W / 2, 735), 'ALEX PHU  /  DALLAS TX', fill='#6c6a63', font=font(22, mono=True), anchor='mm')
    p = os.path.join(TEX, 'poster.png'); im.save(p); return p

def draw_checker():
    im = Image.new('RGB', (512, 512)); d = ImageDraw.Draw(im)
    for f in range(8):
        for r in range(8):
            d.rectangle((f * 64, r * 64, f * 64 + 63, r * 64 + 63), fill='#e7d9bf' if (f + r) % 2 else '#5a3c27')
    p = os.path.join(TEX, 'checker.png'); im.save(p); return p

def draw_paper():
    W, H = 420, 594
    im = Image.new('RGB', (W, H), '#f6f4ef'); d = ImageDraw.Draw(im)
    d.text((W / 2, 70), 'AskAAPM', fill='#1d2725', font=font(40), anchor='mm')
    d.rectangle((90, 110, 330, 114), fill='#c9c6bf')
    y = 150
    for i in range(26):
        w = 300 if i % 7 != 6 else 170
        d.rectangle((60, y, 60 + w, y + 5), fill='#b3b0a8'); y += 15
        if i == 8: y += 14
    p = os.path.join(TEX, 'paper.png'); im.save(p); return p

# ================================================================ BUILD
log('building scene')
WALL = pmat('wall', '#ebe8e2', 0.9)
TRIM = pmat('trim', '#f4f2ee', 0.5)
node_mat('floor', wood_floor)
FLOOR = MATS['floor']
node_mat('wallnoise', noisy('#ebe8e2', 0.025, 30))
WALLN = MATS['wallnoise']

# ---- room shell (diorama cutaway: floor slab + two walls)
room = []
room.append(box('floor', (3.4, 2.4, 0.1), (0.25, -0.5, -0.05), FLOOR, bevel=0.004))
room.append(box('wall_back', (3.4, 0.12, 2.7), (0.25, 0.64, 1.35), WALLN, bevel=0.004))
WX = -1.39  # left wall center x (inner face at -1.33)
# left wall: one solid with the window cut out, so its inner face unwraps as one seamless island
lw = box('wall_left', (0.12, 2.28, 2.7), (WX, -0.56, 1.35), WALLN, bevel=0)
cutter = box('cutter', (0.4, 1.0, 1.2), (WX, -0.45, 1.5), WALLN, bevel=0)
bo = lw.modifiers.new('cut', 'BOOLEAN'); bo.operation = 'DIFFERENCE'; bo.object = cutter; bo.solver = 'EXACT'
finalize(lw)
bpy.data.objects.remove(cutter)
room.append(lw)
# window frame
room.append(box('sill', (0.2, 1.08, 0.035), (-1.355, -0.45, 0.885), TRIM))
room.append(box('jamb_a', (0.12, 0.04, 1.2), (WX, -0.93, 1.5), TRIM))
room.append(box('jamb_b', (0.12, 0.04, 1.2), (WX, 0.03, 1.5), TRIM))
room.append(box('head', (0.12, 1.0, 0.04), (WX, -0.45, 2.08), TRIM))
room.append(box('mullion', (0.05, 0.035, 1.16), (WX, -0.45, 1.5), TRIM))
room.append(box('transom', (0.05, 0.92, 0.035), (WX, -0.45, 1.68), TRIM))
# baseboards
room.append(box('base_back', (3.4, 0.015, 0.08), (0.25, 0.5725, 0.04), TRIM, bevel=0.002))
room.append(box('base_left', (0.015, 2.28, 0.08), (-1.3225, -0.56, 0.04), TRIM, bevel=0.002))
# poster + corkboard
room.append(box('poster', (0.45, 0.006, 0.6), (-0.72, 0.575, 1.78), image_mat('poster', draw_poster(), 'XZ'), bevel=0))
room.append(box('cork_frame', (0.64, 0.02, 0.44), (0.0, 0.57, 1.62), pmat('cork_frame', '#b9a27f', 0.6), bevel=0.003))
node_mat('cork', noisy('#b08a63', 0.12, 300))
room.append(box('cork', (0.6, 0.004, 0.40), (0.0, 0.558, 1.62), MATS['cork'], bevel=0))
notes = [('#f3dd6b', -0.19, 1.72, 4), ('#9fd3c7', -0.05, 1.68, -6), ('#f2f0ea', 0.13, 1.70, 3), ('#f4a37a', -0.11, 1.53, 7), ('#f2f0ea', 0.15, 1.52, -3)]
for i, (c, x, z, a) in enumerate(notes):
    room.append(box(f'note{i}', (0.1, 0.002, 0.08), (x, 0.555, z), pmat(f'note{i}', c, 0.8), rot=(0, R(a), 0), bevel=0))
    room.append(cyl(f'pin{i}', 0.005, 0.008, (x, 0.552, z + 0.03), pmat('pin', '#c8402c', 0.4), rot=(R(90), 0, 0), verts=12))
# plant in the back-left corner
pot = lathe('pot', [(0, 0), (0.1, 0), (0.105, 0.005), (0.125, 0.30), (0.112, 0.30), (0.095, 0.03), (0, 0.03)], (-1.1, 0.36, 0), pmat('pot', '#c26a43', 0.8))
soil = cyl('soil', 0.11, 0.01, (-1.1, 0.36, 0.27), pmat('soil', '#3a2a20', 1.0))
leaves = []
rng = np.random.default_rng(7)
LEAF = pmat('leaf', '#4b7a3f', 0.5)
for i in range(11):
    h = rng.uniform(0.45, 0.85)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=10, radius1=0.032, radius2=0.002, depth=h)
    bmesh.ops.scale(bm, vec=Vector((1, 0.22, 1)), verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector((0, 0, h / 2)), verts=bm.verts)
    ang = rng.uniform(0, 2 * math.pi); tilt = rng.uniform(0.05, 0.3)
    off = Vector((math.cos(ang), math.sin(ang), 0)) * rng.uniform(0.0, 0.05)
    ob = make(f'leaf{i}', bm, LEAF if i % 3 else pmat('leaf2', '#6b8f45', 0.5),
              loc=(-1.1 + off.x, 0.36 + off.y, 0.27), rot=(tilt * math.cos(ang + 1.57), tilt * math.sin(ang + 1.57), ang), smooth=60)
    leaves.append(ob)
room.append(join([pot, soil] + leaves, 'plant', 'room'))
for o in room: tag(o, 'room')

# sky panel seen through the window (not baked, drawn flat in the browser)
bm = bmesh.new()
v = [bm.verts.new(p) for p in [(-1.95, -1.4, 0.5), (-1.95, 0.5, 0.5), (-1.95, 0.5, 2.5), (-1.95, -1.4, 2.5)]]
bm.faces.new(v)
sky = make('sky', bm, pmat('skymat', '#e9f2f7'))
for attr in ('visible_diffuse', 'visible_glossy', 'visible_shadow', 'visible_transmission', 'visible_volume_scatter'):
    setattr(sky, attr, False)

# ---- desk
DESKTOP = pmat('desktop', '#efeeea', 0.35)
METAL = pmat('legs', '#3b3d40', 0.45)
desk = [box('top', (1.6, 0.8, 0.03), (0, 0, ZT - 0.015), DESKTOP, bevel=0.004)]
for sx in (-1, 1):
    for sy in (-1, 1):
        desk.append(box(f'leg{sx}{sy}', (0.045, 0.045, ZT - 0.03), (sx * 0.75, sy * 0.35, (ZT - 0.03) / 2), METAL, bevel=0.004))
    desk.append(box(f'apron_y{sx}', (0.03, 0.66, 0.05), (sx * 0.75, 0, ZT - 0.055), METAL, bevel=0.003))
for sy in (-1, 1):
    desk.append(box(f'apron_x{sy}', (1.46, 0.03, 0.05), (0, sy * 0.35, ZT - 0.055), METAL, bevel=0.003))
desk_ob = tag(join(desk, 'desk', 'desk'), 'desk')

# ---- office chair
FAB = pmat('fabric', '#30343a', 0.95)
PLAS = pmat('plastic', '#1e1f22', 0.5)
GREY = pmat('chrome', '#8d9094', 0.3)
parts = []
for k in range(5):
    bm = bmesh.new(); bm_box(bm, (0.3, 0.045, 0.028), (0.15, 0, 0))
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(k * 2 * math.pi / 5, 3, 'Z'))
    parts.append(make(f'arm{k}', bm, PLAS, (0, 0, 0.07), bevel=0.006))
    a = k * 2 * math.pi / 5
    parts.append(sphere(f'caster{k}', 0.026, (0.29 * math.cos(a), 0.29 * math.sin(a), 0.027), PLAS, (1, 0.7, 1), rot=(0, 0, a)))
parts.append(cyl('hub', 0.045, 0.06, (0, 0, 0.08), PLAS))
parts.append(cyl('gas', 0.022, 0.34, (0, 0, 0.27), GREY))
parts.append(box('mech', (0.2, 0.22, 0.04), (0, 0.02, 0.44), PLAS, bevel=0.006))
parts.append(box('seat', (0.5, 0.48, 0.085), (0, 0.03, 0.5), FAB, bevel=0.035, seg=4))
# The backrest reclines (positive X rotation tips its top toward -Y, away from the seat).
# It pivots on its bottom edge, which stays at about (y -0.30, z 0.67) just behind the seat.
parts.append(box('spine', (0.06, 0.035, 0.36), (0, -0.285, 0.625), PLAS, rot=(R(14), 0, 0), bevel=0.006))
parts.append(box('back', (0.46, 0.075, 0.5), (0, -0.355, 0.917), FAB, rot=(R(13), 0, 0), bevel=0.035, seg=4))
for sx in (-1, 1):
    parts.append(box(f'armpost{sx}', (0.03, 0.05, 0.2), (sx * 0.255, -0.02, 0.6), PLAS, bevel=0.006))
    parts.append(box(f'armpad{sx}', (0.065, 0.25, 0.03), (sx * 0.255, 0.0, 0.71), PLAS, bevel=0.01, seg=3))
chair = tag(join(parts, 'chair', 'desk', loc=(0.08, -0.8, 0), rot_z=R(-16)), 'desk')

# ---- mug
mug = lathe('mugbody', [(0, 0), (0.037, 0), (0.04, 0.004), (0.041, 0.095), (0.037, 0.095), (0.035, 0.012), (0, 0.012)], (0, 0, 0), pmat('mug', '#e9e5dc', 0.3))
coffee = cyl('coffee', 0.0352, 0.003, (0, 0, 0.074), pmat('coffee', '#3b2417', 0.2))
handle = sweep('handle', smooth_path([(0.038, 0, 0.078), (0.062, 0, 0.072), (0.068, 0, 0.05), (0.062, 0, 0.029), (0.038, 0, 0.024)], 8), 0.0065, MATS['mug'])
mug_ob = tag(join([mug, coffee, handle], 'mug', 'desk', loc=(0.42, -0.31, ZT), rot_z=R(205)), 'desk')
pad = tag(box('mousepad', (0.23, 0.19, 0.003), (0.36, -0.14, ZT + 0.0015), pmat('pad', '#2d3742', 0.9), bevel=0), 'desk')

# ---- computer (monitor, keyboard, mouse, tower)
GRAPH = pmat('graphite', '#2a2c30', 0.35)
KEYS = pmat('keys', '#3a3d42', 0.6)
mon = []
mon.append(box('body', (0.6, 0.05, 0.4), (0, 0.2, 1.04), GRAPH, bevel=0.006, seg=3))
# bezel lip around the display
SW, SH = 0.54, 0.3375
mon.append(box('lip_t', (0.6, 0.006, (0.4 - SH) / 2), (0, 0.172, 1.04 + SH / 2 + (0.4 - SH) / 4), GRAPH, bevel=0.0015))
mon.append(box('lip_b', (0.6, 0.006, (0.4 - SH) / 2), (0, 0.172, 1.04 - SH / 2 - (0.4 - SH) / 4), GRAPH, bevel=0.0015))
mon.append(box('lip_l', ((0.6 - SW) / 2, 0.006, SH), (-SW / 2 - (0.6 - SW) / 4, 0.172, 1.04), GRAPH, bevel=0.0015))
mon.append(box('lip_r', ((0.6 - SW) / 2, 0.006, SH), (SW / 2 + (0.6 - SW) / 4, 0.172, 1.04), GRAPH, bevel=0.0015))
mon.append(box('led', (0.008, 0.002, 0.003), (0.27, 0.168, 1.04 - SH / 2 - 0.016), pmat('led', '#5fd3ff', 0.2), bevel=0))
mon.append(box('neck', (0.06, 0.03, 0.2), (0, 0.25, 0.88), GRAPH, bevel=0.005))
mon.append(box('hinge', (0.12, 0.05, 0.06), (0, 0.24, 0.98), GRAPH, bevel=0.008))
mon.append(cyl('base', 0.11, 0.014, (0, 0.24, ZT + 0.007), GRAPH, verts=48, bevel=0.003))
monitor = tag(join(mon, 'computer_monitor', 'computer'), 'computer')

# screen plane: the OS is drawn here in the browser; in Cycles it glows teal and lights the keyboard
bm = bmesh.new()
v = [bm.verts.new(p) for p in [(-SW / 2, 0, -SH / 2), (SW / 2, 0, -SH / 2), (SW / 2, 0, SH / 2), (-SW / 2, 0, SH / 2)]]
bm.faces.new(v)
scr_mat = bpy.data.materials.new('screenmat')
bsdf = scr_mat.node_tree.nodes['Principled BSDF']
bsdf.inputs['Base Color'].default_value = (0, 0, 0, 1)
bsdf.inputs['Emission Color'].default_value = (*lin('#2f6f69'), 1)
bsdf.inputs['Emission Strength'].default_value = 3.0
screen = make('screen', bm, scr_mat, loc=(0, 0.173, 1.04))

kb = bmesh.new()
bm_box(kb, (0.44, 0.15, 0.018), (0, 0, 0.009))
keycaps = bmesh.new()
for r in range(5):
    y = 0.05 - r * 0.025
    if r < 4:
        for c in range(15):
            bm_box(keycaps, (0.0235, 0.0205, 0.009), (-0.2 + c * 0.0286, y, 0.0225))
    else:
        for c, w in [(-0.2, 1), (-0.1714, 1), (-0.1428, 1)]:
            bm_box(keycaps, (0.0235, 0.0205, 0.009), (c, y, 0.0225))
        bm_box(keycaps, (0.17, 0.0205, 0.009), (-0.014, y, 0.0225))
        for c in range(4):
            bm_box(keycaps, (0.0235, 0.0205, 0.009), (0.114 + c * 0.0286, y, 0.0225))
kb_ob = make('kbbase', kb, GRAPH, bevel=0.004)
caps_ob = make('kbcaps', keycaps, KEYS, bevel=0.002)
keyboard = tag(join([kb_ob, caps_ob], 'computer_keyboard', 'computer', loc=(0, -0.12, ZT), rot_z=R(-2)), 'computer')

ms = [sphere('mshell', 1.0, (0, 0, 0.004), MATS.get('mouse') or pmat('mouse', '#d6d0c2', 0.4), scale=(0.032, 0.056, 0.022))]
ms.append(box('mbtn', (0.0015, 0.04, 0.004), (0, 0.03, 0.022), pmat('seam', '#8a857a', 0.6), bevel=0))
mouse = tag(join(ms, 'computer_mouse', 'computer', loc=(0.36, -0.13, ZT + 0.003), rot_z=R(-8)), 'computer')

cable_mat = pmat('cable', '#1d1e20', 0.5)
cables = [sweep('mcable', smooth_path([(0.355, -0.075, ZT + 0.006), (0.34, 0.0, ZT + 0.004), (0.25, 0.1, ZT + 0.004), (0.14, 0.33, ZT + 0.004), (0.1, 0.42, ZT - 0.05)], 10), 0.0022, cable_mat),
          sweep('kcable', smooth_path([(0.0, -0.043, ZT + 0.008), (0.02, 0.05, ZT + 0.004), (0.06, 0.32, ZT + 0.004), (0.05, 0.42, ZT - 0.05)], 10), 0.0025, cable_mat)]
tag(join(cables, 'cables', 'computer'), 'computer')

tw = [box('case', (0.19, 0.44, 0.42), (0, 0, 0.21), GRAPH, bevel=0.005, seg=3)]
tw.append(box('bay1', (0.15, 0.004, 0.04), (0, -0.221, 0.36), KEYS, bevel=0.001))
tw.append(box('bay2', (0.15, 0.004, 0.04), (0, -0.221, 0.31), KEYS, bevel=0.001))
tw.append(cyl('power', 0.012, 0.004, (0, -0.221, 0.24), KEYS, rot=(R(90), 0, 0)))
tw.append(box('pled', (0.012, 0.002, 0.003), (0, -0.221, 0.218), pmat('led', '#5fd3ff', 0.2), bevel=0))
for i in range(6):
    tw.append(box(f'vent{i}', (0.12, 0.002, 0.004), (0, -0.2205, 0.06 + i * 0.014), pmat('vent', '#141517', 0.8), bevel=0))
tower = tag(join(tw, 'computer_tower', 'computer', loc=(0.54, 0.04, 0)), 'computer')

# ---- AskAAPM binder stack
NAVY = pmat('navy', '#2b4a73', 0.5)
RED = pmat('red', '#a33b2e', 0.5)
PAPER = pmat('paper', '#f3f1ec', 0.9)
bs = [box('binder1', (0.25, 0.31, 0.04), (0, 0, 0.02), NAVY, bevel=0.003),
      box('ream', (0.215, 0.285, 0.022), (0.004, 0, 0.051), PAPER, bevel=0.001),
      box('binder2', (0.25, 0.31, 0.035), (0, 0, 0.0795), RED, bevel=0.003),
      box('sheet', (0.21, 0.297, 0.001), (0, 0, 0.0975), image_mat('papertex', draw_paper(), 'XY'), rot=(0, 0, R(-7)), bevel=0)]
binder = tag(join(bs, 'askaapm_binder', 'props', loc=(0.56, 0.12, ZT), rot_z=R(4)), 'props')

# ---- 3D printer (shield)
BLACK = pmat('pblack', '#232427', 0.5)
ORANGE = pmat('porange', '#ec6b2c', 0.45)
ALU = pmat('alu', '#a3a8ae', 0.35)
BRASS = pmat('brass', '#b8903e', 0.35)
TEAL = pmat('teal', '#2fa197', 0.4)
pr = []
pr.append(box('pbase', (0.30, 0.26, 0.05), (0, 0, 0.025), BLACK, bevel=0.005))
pr.append(box('lcd', (0.085, 0.04, 0.05), (0.075, -0.145, 0.03), BLACK, bevel=0.005))
pr.append(box('lcdface', (0.06, 0.002, 0.03), (0.072, -0.166, 0.034), pmat('lcdface', '#1d4f7a', 0.2), bevel=0))
pr.append(cyl('knob', 0.01, 0.012, (0.125, -0.168, 0.03), ORANGE, rot=(R(90), 0, 0)))
pr.append(box('yrail', (0.03, 0.26, 0.012), (0, 0, 0.056), ALU, bevel=0.002))
pr.append(box('bed', (0.2, 0.2, 0.008), (0, 0, 0.075), BLACK, bevel=0.002))
node_mat('pei', noisy('#4f4532', 0.18, 400))
pr.append(box('pei', (0.19, 0.19, 0.0015), (0, 0, 0.0795), MATS['pei'], bevel=0))
pr.append(lathe('part', [(0.022, 0.0), (0.03, 0.0), (0.03, 0.05), (0.022, 0.05), (0.022, 0.0)], (0, 0.03, 0.0805), ORANGE, rot=(0, 0, R(-40)), seg=36, angle=R(250)))
CX, CY = -0.115, 0.08
pr.append(box('zcol', (0.04, 0.04, 0.34), (CX, CY, 0.05 + 0.17), ALU, bevel=0.002))
pr.append(box('zcap', (0.046, 0.046, 0.012), (CX, CY, 0.396), ORANGE, bevel=0.003))
pr.append(box('zcarr', (0.055, 0.055, 0.05), (CX, CY, 0.19), ORANGE, bevel=0.004))
pr.append(box('xarm', (0.24, 0.026, 0.026), (CX + 0.135, CY, 0.19), ALU, bevel=0.002))
pr.append(box('xend', (0.02, 0.03, 0.03), (CX + 0.26, CY, 0.19), BLACK, bevel=0.003))
pr.append(box('head', (0.046, 0.04, 0.058), (0, 0.045, 0.168), ORANGE, bevel=0.004))
pr.append(cyl('fan', 0.015, 0.006, (0, 0.023, 0.17), BLACK, rot=(R(90), 0, 0)))
pr.append(box('heater', (0.016, 0.016, 0.012), (0, 0.045, 0.141), BRASS, bevel=0.001))
pr.append(cyl('nozzle', 0.004, 0.007, (0, 0.045, 0.1315), BRASS, r2=0.001, verts=16))
pr.append(box('bracket', (0.02, 0.02, 0.05), (CX, CY + 0.03, 0.42), BLACK, bevel=0.003))
pr.append(lathe('spool', [(0.0, -0.034), (0.095, -0.034), (0.095, -0.028), (0.03, -0.028), (0.03, 0.028), (0.095, 0.028), (0.095, 0.034), (0.0, 0.034)],
                (CX, CY + 0.03, 0.5), BLACK, rot=(0, R(90), 0), seg=48))
pr.append(lathe('filroll', [(0.0, -0.028), (0.08, -0.028), (0.08, 0.028), (0.0, 0.028)], (CX, CY + 0.03, 0.5), TEAL, rot=(0, R(90), 0), seg=48))
pr.append(sweep('filament', smooth_path([(CX, CY - 0.045, 0.47), (CX + 0.03, CY - 0.06, 0.38), (-0.03, 0.06, 0.29), (0, 0.045, 0.2)], 10), 0.0011, TEAL))
pr.append(sweep('ribbon', smooth_path([(0.0, 0.065, 0.19), (-0.04, 0.12, 0.25), (CX + 0.02, CY + 0.03, 0.22)], 10), 0.003, BLACK))
printer = tag(join(pr, 'shield_printer', 'props', loc=(-0.6, 0.17, ZT)), 'props')

# ---- tennis racket (KinetIQ): built along +Y with butt at origin, lying flat
FRAME = pmat('frame', '#c63d2b', 0.35)
STR = pmat('strings', '#efe9c8', 0.6)
GRIP = pmat('grip', '#ece8df', 0.9)
A, B, HC = 0.125, 0.16, 0.52
rk = [sweep('rim', [(A * math.cos(t), HC + B * math.sin(t), 0) for t in np.linspace(0, 2 * math.pi, 72, endpoint=False)], 0.011, FRAME, closed=True, res=2)]
st = bmesh.new()
for x in np.linspace(-0.105, 0.105, 16):
    h = B * math.sqrt(1 - (x / A) ** 2) - 0.006
    bm_box(st, (0.0015, 2 * h, 0.0015), (x, HC, 0))
for y in np.linspace(-0.14, 0.14, 19):
    h = A * math.sqrt(max(0.0, 1 - (y / B) ** 2)) - 0.006
    if h > 0.01: bm_box(st, (2 * h, 0.0015, 0.0015), (0, HC + y, 0))
rk.append(make('stringbed', st, STR))
for s in (-1, 1):
    t = math.radians(-90 + s * 38)
    rk.append(sweep(f'throat{s}', smooth_path([(A * math.cos(t), HC + B * math.sin(t), 0), (s * 0.035, 0.31, 0), (0, 0.255, 0)], 8), 0.0095, FRAME))
rk.append(cyl('shaft', 0.012, 0.07, (0, 0.225, 0), FRAME, rot=(R(90), 0, 0), verts=16))
rk.append(cyl('handle', 0.0165, 0.2, (0, 0.1, 0), GRIP, rot=(R(90), 0, 0), verts=8))
rk.append(cyl('butt', 0.0175, 0.012, (0, 0.002, 0), FRAME, rot=(R(90), 0, 0), verts=8))
racket = join(rk, 'kinetiq_racket', 'props')
# hung on the back wall above the right side of the desk
# hung straight down on the back wall; the bottom of the head rests on two pegs either side of the throat
RKX, RKY, RKZ = 0.64, 0.556, 0.93   # butt of the handle (world)
racket.data.transform(Matrix.Translation((RKX, RKY, RKZ)) @ Matrix.Rotation(R(90), 4, 'X'))
PEGX = 0.085                          # sideways offset of each peg from the racket's center line
frame_bottom = HC - B * math.sqrt(1 - (PEGX / A) ** 2)   # local height of the frame where it crosses the peg
peg_z = RKZ + frame_bottom - 0.011 - 0.0055               # frame tube radius + peg radius
HOOK = pmat('hook', '#3b3d40', 0.4)
for k, sx in enumerate((-1, 1)):
    x = RKX + sx * PEGX
    room.append(tag(cyl(f'peg{k}', 0.0055, 0.047, (x, 0.5565, peg_z), HOOK, rot=(R(90), 0, 0), verts=16), 'room'))
    room.append(tag(cyl(f'pegtip{k}', 0.0075, 0.005, (x, 0.5335, peg_z + 0.002), HOOK, rot=(R(90), 0, 0), verts=16), 'room'))
    room.append(tag(cyl(f'rosette{k}', 0.013, 0.006, (x, 0.577, peg_z), HOOK, rot=(R(90), 0, 0), verts=24), 'room'))
tag(racket, 'props')

# ---- chessboard + pieces + smart glasses (ChessAI)
BX, BY = -0.42, -0.2
WOOD = pmat('boardwood', '#6b4a32', 0.5)
cb = [box('board', (0.3, 0.3, 0.02), (0, 0, 0.01), WOOD, bevel=0.003),
      box('squares', (0.26, 0.26, 0.0015), (0, 0, 0.0205), image_mat('checker', draw_checker(), 'XY'), bevel=0)]
WP = pmat('wpiece', '#efe8da', 0.35)
BP = pmat('bpiece', '#2a2523', 0.35)
PAWN = [(0, 0), (0.0115, 0), (0.0115, 0.004), (0.009, 0.006), (0.0055, 0.016), (0.0045, 0.021), (0.0075, 0.022), (0.0075, 0.024),
        (0.0045, 0.025), (0.0062, 0.029), (0.0065, 0.032), (0.0055, 0.036), (0.003, 0.0385), (0, 0.039)]
ROOK = [(0, 0), (0.013, 0), (0.013, 0.005), (0.0095, 0.008), (0.0075, 0.03), (0.0105, 0.032), (0.0105, 0.043), (0.007, 0.043), (0.007, 0.04), (0, 0.04)]
KING = [(0, 0), (0.014, 0), (0.014, 0.005), (0.0105, 0.008), (0.006, 0.04), (0.0095, 0.042), (0.0095, 0.045), (0.006, 0.047), (0.008, 0.056), (0.0035, 0.058), (0, 0.058)]
QUEEN = KING[:-3] + [(0.0085, 0.054), (0.004, 0.056), (0.0045, 0.059), (0.003, 0.062), (0, 0.0625)]
def sq(f, r): return (-0.13 + (f + 0.5) * 0.0325, -0.13 + (r + 0.5) * 0.0325, 0.0213)
pieces = [('WK', KING, WP, 4, 0), ('WP1', PAWN, WP, 4, 3), ('WP2', PAWN, WP, 3, 1), ('WP3', PAWN, WP, 5, 1), ('WR', ROOK, WP, 0, 0),
          ('BK', KING, BP, 6, 7), ('BQ', QUEEN, BP, 3, 6), ('BP1', PAWN, BP, 4, 4), ('BP2', PAWN, BP, 5, 6), ('BR', ROOK, BP, 0, 7)]
for nm, prof, m, f, r in pieces:
    cb.append(lathe(nm, prof, sq(f, r), m, seg=28))
    if prof is KING:
        x, y, z = sq(f, r)
        cb.append(box(nm + 'cv', (0.003, 0.003, 0.012), (x, y, z + 0.064), m, bevel=0))
        cb.append(box(nm + 'ch', (0.009, 0.003, 0.003), (x, y, z + 0.065), m, bevel=0))
tag(join(cb, 'chess_board', 'props', loc=(BX, BY, ZT), rot_z=R(4)), 'props')

GLF = pmat('glframe', '#151617', 0.3)
LENS = pmat('lens', '#26302e', 0.1)
gl = []
def rrect(cx, w, h, r, z0):
    pts = []
    for (qx, qz, a0) in [(w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, 90), (-w / 2 + r, -h / 2 + r, 180), (w / 2 - r, -h / 2 + r, 270)]:
        for k in range(6):
            a = math.radians(a0 + k * 18)
            pts.append((cx + qx + r * math.cos(a), 0, z0 + qz + r * math.sin(a)))
    return pts
for s in (-1, 1):
    cx = s * 0.033
    gl.append(sweep(f'rimg{s}', rrect(cx, 0.05, 0.04, 0.012, 0.026), 0.0038, GLF, closed=True, res=2))
    bm = bmesh.new()
    vs = [bm.verts.new(p) for p in rrect(cx, 0.046, 0.036, 0.01, 0.026)]
    bm.faces.new(vs)
    lens = make(f'lens{s}', bm, LENS)
    sol = lens.modifiers.new('s', 'SOLIDIFY'); sol.thickness = 0.002
    gl.append(finalize(lens, 40))
    gl.append(box(f'temple{s}', (0.12, 0.007, 0.012), (s * 0.005, 0.016 + (0.009 if s > 0 else 0), 0.008 + (0.004 if s > 0 else 0)), GLF, bevel=0.002))
gl.append(sweep('bridge', smooth_path([(-0.009, 0, 0.038), (0, 0, 0.042), (0.009, 0, 0.038)], 6), 0.003, GLF))
gl.append(cyl('camdot', 0.0028, 0.003, (-0.058, -0.004, 0.043), pmat('camring', '#9aa0a6', 0.3), rot=(R(90), 0, 0), verts=16))
tag(join(gl, 'chess_glasses', 'props', loc=(-0.685, -0.25, ZT), rot_z=R(18)), 'props')

# ---------------------------------------------------------------- lights
world = bpy.data.worlds.new('world'); scene.world = world
bg = world.node_tree.nodes['Background']
bg.inputs['Color'].default_value = (*lin('#dfe6ee'), 1)
bg.inputs['Strength'].default_value = 0.3

def area(name, loc, rot, size, energy, color):
    L = bpy.data.lights.new(name, 'AREA'); L.shape = 'RECTANGLE'; L.size = size[0]; L.size_y = size[1]
    L.energy = energy; L.color = color
    o = bpy.data.objects.new(name, L); COLL.objects.link(o); o.location = loc; o.rotation_euler = rot
    return o
area('window_light', (-1.75, -0.45, 1.55), (0, R(-90), 0), (1.25, 1.1), 2200, lin('#f2f6ff'))
area('ceiling', (0.25, -0.45, 2.9), (0, 0, 0), (2.2, 1.6), 550, lin('#fff1df'))
area('fill_front', (1.2, -2.6, 1.8), (R(65), 0, R(25)), (1.5, 1.5), 180, lin('#fffaf2'))

# ---------------------------------------------------------------- bake
GROUPS = ['room', 'desk', 'computer', 'props']
objs_by_group = {g: [o for o in COLL.objects if o.type == 'MESH' and o.get('grp') == g] for g in GROUPS}
for g, lst in objs_by_group.items(): log(g, len(lst), 'objects', sum(len(o.data.polygons) for o in lst), 'faces')

def unwrap(objs):
    for o in objs:
        while o.data.uv_layers: o.data.uv_layers.remove(o.data.uv_layers[0])
        o.data.uv_layers.new(name='bake')
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=R(60), island_margin=0.012, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(margin=0.008, rotate=True)
    bpy.ops.object.mode_set(mode='OBJECT')

def uv_mask(objs, res):
    im = Image.new('L', (res, res), 0); d = ImageDraw.Draw(im)
    for o in objs:
        uv = o.data.uv_layers['bake'].data
        for p in o.data.polygons:
            pts = [(uv[i].uv[0] * res, (1 - uv[i].uv[1]) * res) for i in p.loop_indices]
            d.polygon(pts, fill=255, outline=255)
    return np.asarray(im, dtype=np.float32)[::-1] / 255.0  # bottom-up like Blender pixels

def bake(objs, img, kind, samples):
    for o in objs:
        for m in o.data.materials:
            nt = m.node_tree
            n = nt.nodes.get('BAKE') or nt.nodes.new('ShaderNodeTexImage')
            n.name = 'BAKE'; n.image = img
            nt.nodes.active = n
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    scene.cycles.samples = samples
    scene.render.bake.margin = max(4, img.size[0] // 128)
    scene.render.bake.margin_type = 'EXTEND'
    pf = {'COLOR'} if kind == 'albedo' else {'DIRECT', 'INDIRECT'}
    bpy.ops.object.bake(type='DIFFUSE', pass_filter=pf, use_clear=True)
    a = np.empty(img.size[0] * img.size[1] * 4, np.float32)
    img.pixels.foreach_get(a)
    return a.reshape(img.size[1], img.size[0], 4)[..., :3]

# make materials unique per group so each group bakes into its own atlas
for g, objs in objs_by_group.items():
    for o in objs:
        if any(m is None for m in o.data.materials):
            for i, m in enumerate(o.data.materials):
                if m is None: o.data.materials[i] = WALLN
        for i, m in enumerate(o.data.materials):
            if not m.name.endswith('@' + g):
                key = m.name + '@' + g
                o.data.materials[i] = bpy.data.materials.get(key) or m.copy()
                o.data.materials[i].name = key

results = {}
for g in GROUPS:
    objs = objs_by_group[g]
    unwrap(objs)
    log(g, 'unwrapped')
    ia = bpy.data.images.new(f'alb_{g}', ALB_RES, ALB_RES, alpha=False, float_buffer=True)
    alb = bake(objs, ia, 'albedo', ALB_SAMPLES)
    log(g, 'albedo baked')
    il = bpy.data.images.new(f'light_{g}', LIGHT_RES, LIGHT_RES, alpha=False, float_buffer=True)
    light = bake(objs, il, 'light', LIGHT_SAMPLES)
    log(g, 'light baked')
    mask = uv_mask(objs, LIGHT_RES)
    sig = 1.6 if MODE == 'final' else 1.0
    num = np.stack([gaussian_filter(light[..., c] * mask, sig) for c in range(3)], -1)
    den = gaussian_filter(mask, sig)[..., None]
    lb = np.where(den > 1e-4, num / np.maximum(den, 1e-4), light)
    up = np.stack([np.asarray(Image.fromarray(lb[..., c].astype(np.float32), 'F').resize((ALB_RES, ALB_RES), Image.BILINEAR)) for c in range(3)], -1)
    results[g] = (alb, up, mask)

# exposure: map the room's typical lit wall/floor value to a bright display value
alb, up, mask = results['room']
m_up = np.asarray(Image.fromarray((mask * 255).astype(np.uint8)).resize((ALB_RES, ALB_RES), Image.NEAREST)) > 127
lum = (alb * up).mean(-1)[m_up]
EXPO = 0.95 / np.percentile(lum, 90)
LIFT = 0.10  # ambient lift so cut edges and deep shadows stay readable, like a bright studio diorama
log('exposure', EXPO)

def aces(x):
    return np.clip((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0, 1)
def to_srgb(x):
    return np.where(x <= 0.0031308, 12.92 * x, 1.055 * np.power(np.maximum(x, 0), 1 / 2.4) - 0.055)

baked_mats = {}
for g, (alb, up, mask) in results.items():
    col = to_srgb(aces(alb * (up * EXPO + LIFT)))
    im = Image.fromarray((np.clip(col, 0, 1)[::-1] * 255 + 0.5).astype(np.uint8), 'RGB')
    p = os.path.join(OUT, f'baked_{g}.jpg'); im.save(p, quality=88, optimize=True)
    m = bpy.data.materials.new(f'baked_{g}')
    nt = m.node_tree; b = nt.nodes['Principled BSDF']
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(p)
    nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
    baked_mats[g] = m
    log('saved', p, os.path.getsize(p) // 1024, 'KB')

for g, objs in objs_by_group.items():
    for o in objs:
        o.data.materials.clear(); o.data.materials.append(baked_mats[g])

# drop lights before export; keep sky and screen as plain-colored meshes
for o in list(COLL.objects):
    if o.type == 'LIGHT': bpy.data.objects.remove(o)
for o in (sky, screen):
    if not o.data.uv_layers: o.data.uv_layers.new(name='bake')

bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'desk.glb'), export_format='GLB', export_apply=True,
                          export_texcoords=True, export_normals=False, export_cameras=False, export_lights=False,
                          export_yup=True, export_image_format='AUTO')
log('exported', os.path.getsize(os.path.join(OUT, 'desk.glb')) // 1024, 'KB')
