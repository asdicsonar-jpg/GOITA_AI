#!/usr/bin/env python3
"""区画の照合: 基底と出力の <script> ブロックを比べ、変わったのが UI（ブロック 6）だけか・
エンジン（G=1・G_B=2・T1=3〜5）とブロック 0・7・8 が byte 一致か・gzip が上限内かを見る。

使い方: python3 blocks_check.py <基底.html> <出力.html> [--engine-ref <エンジンが同じはずの別の版.html> ...]
元の道具（v220_6_blocks_check.py・make_block_raw.js）の代わり。終了コード 0 = PASS。
"""
import argparse, gzip, hashlib, re, sys

GZ_LIMIT = 5966503
UI = {6}
NAMES = {0: 'SW 登録', 1: 'G', 2: 'G_B', 3: 'T1 重み', 4: 'T1 推論', 5: 'T1 アダプタ', 6: 'UI', 7: 'QR 生成', 8: 'QR 読取'}
RX = re.compile(r'<script\b[^>]*>(.*?)</script>', re.S)


def blocks(path):
    s = open(path, 'rb').read().decode('utf-8')
    return s, [m.group(1) for m in RX.finditer(s)]


def h(t):
    return hashlib.sha256(t.encode('utf-8')).hexdigest()[:16]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('base')
    ap.add_argument('out')
    ap.add_argument('--engine-ref', action='append', default=[])
    a = ap.parse_args()
    _, bb = blocks(a.base)
    so, bo = blocks(a.out)
    ok = True
    if len(bb) != 9 or len(bo) != 9:
        print(f'FAIL: ブロックの数 基底 {len(bb)}・出力 {len(bo)}（9 のはず）')
        sys.exit(1)
    changed = []
    for i in range(9):
        same = bb[i] == bo[i]
        if not same:
            changed.append(i)
        print(f'[{i}] {NAMES[i]:8s} {len(bo[i]):>9,} 字  {h(bo[i])}  {"同じ" if same else "変わった"}')
    bad = [i for i in changed if i not in UI]
    print(f'変わったブロック: {changed}' + ('' if not bad else f'  ← UI 以外 {bad}'))
    if bad:
        ok = False
    for ref in a.engine_ref:
        _, br = blocks(ref)
        for i in (1, 2, 3, 4, 5):
            if br[i] != bo[i]:
                print(f'FAIL: [{i}] {NAMES[i]} が {ref} と違う')
                ok = False
        print(f'エンジン（1〜5）と {ref}: {"一致" if ok else "不一致"}')
    gz = len(gzip.compress(so.encode('utf-8'), 9))
    print(f'gzip -9: {gz:,} B（上限 {GZ_LIMIT:,} B・残り {GZ_LIMIT - gz:,} B）')
    if gz > GZ_LIMIT:
        ok = False
    print('=> PASS' if ok else '=> FAIL')
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
