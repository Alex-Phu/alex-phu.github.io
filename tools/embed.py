"""Usage: python tools/embed.py model/desk.glb index.html
Splits the baked model into geometry + JPEG textures and embeds them in the page as base64 text,
so the page works as one file (claude.ai artifacts cannot serve .glb files or blob: URLs)."""
import json, struct, base64, re, sys
glb_path, page = sys.argv[1], sys.argv[2]
b = open(glb_path, 'rb').read()
jlen = struct.unpack('<I', b[12:16])[0]; J = json.loads(b[20:20 + jlen]); J0 = json.loads(b[20:20 + jlen])
off = 20 + jlen; blen = struct.unpack('<I', b[off:off + 4])[0]; BIN = b[off + 8:off + 8 + blen]
tex = {}
for m in J['materials']:
    t = m.get('pbrMetallicRoughness', {}).pop('baseColorTexture', None)
    if t is None: continue
    img = J['images'][J['textures'][t['index']]['source']]
    bv = J['bufferViews'][img['bufferView']]; s0 = bv.get('byteOffset', 0)
    tex[m['name']] = (BIN[s0:s0 + bv['byteLength']], img.get('mimeType', 'image/jpeg'))
for k in ('textures', 'images', 'samplers'): J.pop(k, None)
used = sorted({a['bufferView'] for a in J['accessors']})
remap = {old: new for new, old in enumerate(used)}
newbin = bytearray(); bvs = []
for old in used:
    bv = dict(J0['bufferViews'][old])
    while len(newbin) % 4: newbin.append(0)
    s0 = bv.get('byteOffset', 0); bv['byteOffset'] = len(newbin); newbin += BIN[s0:s0 + bv['byteLength']]; bvs.append(bv)
J['bufferViews'] = bvs
for a in J['accessors']: a['bufferView'] = remap[a['bufferView']]
while len(newbin) % 4: newbin.append(0)
J['buffers'] = [{'byteLength': len(newbin)}]
js = json.dumps(J, separators=(',', ':')).encode()
while len(js) % 4: js += b' '
out = struct.pack('<III', 0x46546C67, 2, 28 + len(js) + len(newbin)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(newbin), 0x004E4942) + bytes(newbin)
tags = '<script type="text/plain" id="desk-geo">' + base64.b64encode(out).decode() + '</script>\n'
for k, (data, mime) in tex.items():
    tags += f'<script type="text/plain" data-tex="{k}" data-mime="{mime}">' + base64.b64encode(data).decode() + '</script>\n'
html = open(page).read()
html = re.sub(r'<script type="text/plain" (id="desk-geo"|data-tex="[^"]*"[^>]*)>.*?</script>\n?', '', html, flags=re.S).rstrip()
if html.endswith('</html>') and '</body>' in html:  # full page: put the model just before </body>
    cut = html.rindex('</body>')
    html = html[:cut].rstrip() + '\n' + tags + html[cut:] + '\n'
else:
    html = html + '\n' + tags
open(page, 'w').write(html)
print('embedded', len(out) // 1024, 'KB geometry,', {k: len(v[0]) // 1024 for k, v in tex.items()}, 'KB textures; page', len(html) // 1024, 'KB')
