#!/usr/bin/env python3
"""配信物化: 版数・更新内容（APP_CHANGELOG）・バッジ・ヘッダの注記・sw.js（対象の sha・注記・CACHE_NAME）。

使い方:
  python3 apply_ui_release.py <s1.html> <out.html> <sw_in.js> <sw_out.js> \
      --base v220.11 --ver v220.12 --date 2026-09-28 --json release_v220_12.json
  python3 apply_ui_release.py --unrelease <index.html> <s1.html> <sw.js> <sw_base.js> \
      --base v220.8 --ver v220.9 --prev-sha <基底の index.html の sha256>   # 逆変換（道具の照合用）

元の道具（大きい一式の harness/apply_ui_release.py）は手元に無いため、公開済みの版（v220.8・v220.9・v220.11）の
形から作り直した。照合は test_release_roundtrip.sh（v220.8→v220.9 を公開物と byte 一致で作り直す）。
各置換は逐語でちょうど 1 回当たること。違えば止まる。
"""
import argparse, hashlib, json, re, sys

BAD = ['"', '\\', '\n', '\r', '--', '{', '}', '</script']


def die(msg):
    sys.stderr.write('STOP: ' + msg + '\n')
    sys.exit(2)


def once(s, old, new, what):
    n = s.count(old)
    if n != 1:
        die(f'{what}: 一致 {n} 回（1 回のはず）: {old[:80]!r}')
    return s.replace(old, new)


def check_text(t, what):
    for b in BAD:
        if b in t:
            die(f'{what} に使えない文字列 {b!r}: {t[:80]!r}')


def sha(b):
    return hashlib.sha256(b).hexdigest()


def load_json(path, base, ver):
    j = json.load(open(path, encoding='utf-8'))
    header = [l.replace('{VER}', ver).replace('{BASE}', base) for l in j['header']]
    for l in header:
        for b in ['\n', '\r', '</script', '{', '}']:
            if b in l:
                die(f'header に使えない文字列 {b!r}')
    if '--' in '\n'.join(header).replace('<!--', '').replace('-->', ''):
        die('header に連続ハイフン')
    cl = j['changelog']
    for k in ('tag', 'tagJa', 't'):
        check_text(cl[k], 'changelog.' + k)
    for p in cl['p']:
        check_text(p, 'changelog.p')
    note = j['sw_note'].replace('{VER}', ver).replace('{BASE}', base)
    for b in ['\n', '\r']:
        if b in note:
            die('sw_note に改行')
    if not note.startswith('// ' + ver + ': '):
        die('sw_note は「// {VER}: 」で始めること')
    return header, cl, note


def changelog_entry(ver, date, cl):
    ps = ',\n'.join('      "' + p + '"' for p in cl['p'])
    return (f'    {{v: "{ver}", d: "{date}", tag: "{cl["tag"]}", tagJa: "{cl["tagJa"]}", t: "{cl["t"]}", p: [\n'
            + ps + ']},\n')


CL_HEAD = '  const APP_CHANGELOG = [\n'


def release(s1, sw_in, base, ver, date, header, cl, note):
    h = s1
    if not re.search(r'\{v: "' + re.escape(base) + r'", d: ', h[h.index(CL_HEAD):h.index(CL_HEAD) + 400]):
        die(f'APP_CHANGELOG の先頭が {base} ではない')
    anchor = f'  <!-- build: {base}「'
    h = once(h, '\n' + anchor, '\n' + '\n'.join(header) + '\n' + anchor, 'ヘッダの注記')
    h = once(h, CL_HEAD, CL_HEAD + changelog_entry(ver, date, cl), 'APP_CHANGELOG')
    h = once(h, f'aria-label="バージョン {base} — 更新内容を見る"', f'aria-label="バージョン {ver} — 更新内容を見る"', 'バッジ aria-label')
    h = once(h, f'<span id="btn-version-num">{base}</span>', f'<span id="btn-version-num">{ver}</span>', 'バッジの版数')
    hb = h.encode('utf-8')
    s = sw_in
    m = re.findall(r'^// 対象: index\.html \(build ' + re.escape(base) + r', SHA-256 [0-9a-f]{64}\)$', s, re.M)
    if len(m) != 1:
        die('sw.js の対象の行が 1 行でない')
    s = s.replace(m[0], f'// 対象: index.html (build {ver}, SHA-256 {sha(hb)})')
    notes = re.findall(r'^// ' + re.escape(base) + r': .*$', s, re.M)
    if len(notes) != 1:
        die(f'sw.js の {base} の注記が 1 行でない')
    s = once(s, notes[0] + '\n', notes[0] + '\n' + note + '\n', 'sw.js 注記')
    s = once(s, f'const CACHE_NAME = "goita-{base}";', f'const CACHE_NAME = "goita-{ver}";', 'CACHE_NAME')
    return h, s


def unrelease(h, sw, base, ver, prev_sha):
    lines = h.split('\n')
    i = next(k for k, l in enumerate(lines) if l.startswith(f'  <!-- build: {ver}「'))
    j = next(k for k, l in enumerate(lines) if l.startswith(f'  <!-- build: {base}「'))
    header = lines[i:j]
    h = '\n'.join(lines[:i] + lines[j:])
    a = h.index(CL_HEAD) + len(CL_HEAD)
    b = h.index(']},\n', a) + 4
    entry = h[a:b]
    h = h[:a] + h[b:]
    h = once(h, f'aria-label="バージョン {ver} — 更新内容を見る"', f'aria-label="バージョン {base} — 更新内容を見る"', 'バッジ aria-label')
    h = once(h, f'<span id="btn-version-num">{ver}</span>', f'<span id="btn-version-num">{base}</span>', 'バッジの版数')
    m = re.findall(r'^// 対象: index\.html \(build ' + re.escape(ver) + r', SHA-256 [0-9a-f]{64}\)$', sw, re.M)
    if len(m) != 1:
        die('sw.js の対象の行が 1 行でない')
    sw = sw.replace(m[0], f'// 対象: index.html (build {base}, SHA-256 {prev_sha})')
    notes = re.findall(r'^// ' + re.escape(ver) + r': .*\n', sw, re.M)
    if len(notes) != 1:
        die('sw.js の注記が 1 行でない')
    sw = sw.replace(notes[0], '')
    sw = once(sw, f'const CACHE_NAME = "goita-{ver}";', f'const CACHE_NAME = "goita-{base}";', 'CACHE_NAME')
    return h, sw, header, entry, notes[0].rstrip('\n')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('files', nargs=4)
    ap.add_argument('--base', required=True)
    ap.add_argument('--ver', required=True)
    ap.add_argument('--date')
    ap.add_argument('--json')
    ap.add_argument('--unrelease', action='store_true')
    ap.add_argument('--prev-sha')
    a = ap.parse_args()
    rd = lambda p: open(p, 'rb').read().decode('utf-8')
    wr = lambda p, t: open(p, 'wb').write(t.encode('utf-8'))
    if a.unrelease:
        h, sw, header, entry, note = unrelease(rd(a.files[0]), rd(a.files[2]), a.base, a.ver, a.prev_sha)
        wr(a.files[1], h)
        wr(a.files[3], sw)
        print('unrelease: header', len(header), '行・changelog', entry.count('\n'), '行・sw 注記', repr(note[:40]))
        return
    header, cl, note = load_json(a.json, a.base, a.ver)
    h, s = release(rd(a.files[0]), rd(a.files[2]), a.base, a.ver, a.date, header, cl, note)
    wr(a.files[1], h)
    wr(a.files[3], s)
    print(f'release {a.base} -> {a.ver}: index.html {sha(h.encode())}  sw.js {sha(s.encode())}')


if __name__ == '__main__':
    main()
