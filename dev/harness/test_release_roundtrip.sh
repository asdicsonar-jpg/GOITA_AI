#!/usr/bin/env bash
# apply_ui_release.py の照合: 公開済みの v220.9（main の dc28894）から配信物化の部分を外し、
# v220.8（c9989c9）の sw.js と release_v220_9.json で作り直して、公開物と byte 一致するか。
set -euo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
T=$(mktemp -d)
git show c9989c9:index.html > "$T/v8.html"; git show c9989c9:sw.js > "$T/sw8.js"
git show dc28894:index.html > "$T/v9.html"; git show dc28894:sw.js > "$T/sw9.js"
P8=$(sha256sum "$T/v8.html" | cut -d' ' -f1)
python3 dev/harness/apply_ui_release.py --unrelease "$T/v9.html" "$T/s1.html" "$T/sw9.js" "$T/sw_back.js" --base v220.8 --ver v220.9 --prev-sha "$P8"
cmp "$T/sw_back.js" "$T/sw8.js" && echo "逆変換の sw.js = v220.8 の sw.js: 一致"
python3 dev/harness/apply_ui_release.py "$T/s1.html" "$T/out.html" "$T/sw8.js" "$T/out_sw.js" --base v220.8 --ver v220.9 --date 2026-09-26 --json dev/harness/release_v220_9.json
cmp "$T/out.html" "$T/v9.html" && cmp "$T/out_sw.js" "$T/sw9.js" && echo "=> 作り直し PASS（index.html・sw.js とも公開中の v220.9 と byte 一致）"
# v220.11（main の 0697aa5）: v220.10 は公開されていないので、逆変換の sw.js が v220.10 候補の sha と一致するかで確かめる
git show 0697aa5:index.html > "$T/v11.html"; git show 0697aa5:sw.js > "$T/sw11.js"
P10=e9e028e9c493e103f366e4719345255faba77b68c4d55bebb25c6af58c2fd484
SW10=4798ab6673ee80e69fdd2678200fb1bed8dbac72684834d41fcd2a5faf8f1b16
python3 dev/harness/apply_ui_release.py --unrelease "$T/v11.html" "$T/s1_11.html" "$T/sw11.js" "$T/sw10.js" --base v220.10 --ver v220.11 --prev-sha "$P10"
[ "$(sha256sum "$T/sw10.js" | cut -d' ' -f1)" = "$SW10" ] && echo "逆変換の sw.js = v220.10 候補の sw.js（$SW10）: 一致"
python3 dev/harness/apply_ui_release.py "$T/s1_11.html" "$T/out11.html" "$T/sw10.js" "$T/out_sw11.js" --base v220.10 --ver v220.11 --date 2026-09-28 --json dev/harness/release_v220_11.json
cmp "$T/out11.html" "$T/v11.html" && cmp "$T/out_sw11.js" "$T/sw11.js" && echo "=> 作り直し PASS（index.html・sw.js とも公開中の v220.11 と byte 一致）"
rm -rf "$T"
