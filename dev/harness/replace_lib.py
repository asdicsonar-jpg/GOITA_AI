"""置換スクリプトの共通部分（元の harness/apply_v220_N.py の形を README §4 の記述から作り直したもの）。

- add(tag, 族, old, new, n=1): old は逐語。並べた順に当てるので、その時点の文字列（前の置換の後）でちょうど n 回当たること（違えば止まる）。
- 逆変換は後ろから当てる。その時点の文字列で new がちょうど n 回であること（前後の文脈を含めて一意にする）。
  最後に基底と byte で比べるので、この条件が甘くても誤って PASS はしない。
- new に <script・</script を入れない。各置換の後に <script> ブロックが 9 のままかを確かめる。
- --verify: 出力に逆向き（new→old）を後ろから当てて基底と byte 一致・G/G_B/T1 のブロックが基底と同じ。
- --ablate 族,族: その族の置換を外した写しを作る（試験の検出力を見る）。
- エンジンの区画（ブロック 0〜5・7・8）にアンカーを置かない（当たったら止まる）。
"""
import argparse, hashlib, re, sys

RX = re.compile(r'<script\b[^>]*>(.*?)</script>', re.S)
FROZEN = (0, 1, 2, 3, 4, 5, 7, 8)


def die(msg):
    sys.stderr.write('STOP: ' + msg + '\n')
    sys.exit(2)


def sha(b):
    return hashlib.sha256(b).hexdigest()


def spans(s):
    return [(m.start(1), m.end(1)) for m in RX.finditer(s)]


class Plan:
    def __init__(self, sha_in):
        self.sha_in = sha_in
        self.items = []

    def add(self, tag, fam, old, new, n=1):
        if old == new or not old:
            die(f'{tag}: old が空か new と同じ')
        if '<script' in new or '</script' in new:
            die(f'{tag}: new に <script・</script を入れない')
        self.items.append((tag, fam, old, new, n))

    def apply(self, s, skip=()):
        sp = spans(s)
        frozen = [sp[i] for i in FROZEN]
        for tag, fam, old, new, n in self.items:
            if fam in skip:
                continue
            c = s.count(old)
            if c != n:
                die(f'{tag}: 一致 {c} 回（{n} 回のはず）')
            pos, k = [], 0
            while True:
                k = s.find(old, k)
                if k < 0:
                    break
                pos.append(k)
                k += len(old)
            for p in pos:
                for a, b in frozen:
                    if p < b and p + len(old) > a:
                        die(f'{tag}: エンジン・固定の区画にアンカーがある')
            s = s.replace(old, new)
            sp = spans(s)
            if len(sp) != 9:
                die(f'{tag}: 置換の後の <script> ブロックが {len(sp)}（9 のはず）')
            frozen = [sp[i] for i in FROZEN]
        return s

    def unapply(self, s):
        for tag, fam, old, new, n in reversed(self.items):
            c = s.count(new)
            if c != n:
                die(f'逆変換 {tag}: new の一致 {c} 回（{n} 回のはず）')
            s = s.replace(new, old)
        return s

    def main(self):
        ap = argparse.ArgumentParser()
        ap.add_argument('base')
        ap.add_argument('out')
        ap.add_argument('--verify', action='store_true')
        ap.add_argument('--ablate', default='')
        a = ap.parse_args()
        bb = open(a.base, 'rb').read()
        if sha(bb) != self.sha_in:
            die(f'基底の sha が違う: {sha(bb)}（{self.sha_in} のはず）')
        base = bb.decode('utf-8')
        fams = sorted({f for _, f, *_ in self.items})
        if a.verify:
            out = open(a.out, 'rb').read().decode('utf-8')
            if out != self.apply(base):
                die('出力が基底からの作り直しと違う')
            back = self.unapply(out)
            if back.encode('utf-8') != bb:
                die('逆変換が基底と byte 一致しない')
            rb = [m.group(1) for m in RX.finditer(base)]
            ro = [m.group(1) for m in RX.finditer(out)]
            for i in FROZEN:
                if rb[i] != ro[i]:
                    die(f'ブロック {i} が基底と違う')
            print(f'--verify PASS: 置換 {len(self.items)} 本（族 {fams}）・逆変換 byte 一致・ブロック {list(FROZEN)} は基底と同じ')
            return
        skip = tuple(x for x in a.ablate.split(',') if x)
        for f in skip:
            if f not in fams:
                die(f'知らない族: {f}（{fams}）')
        out = self.apply(base, skip)
        ob = out.encode('utf-8')
        open(a.out, 'wb').write(ob)
        print(f'置換 {len(self.items)} 本' + (f'（外した族 {list(skip)}）' if skip else '') + f' -> {a.out} {sha(ob)}')
