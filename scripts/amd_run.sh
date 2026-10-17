#!/usr/bin/env bash
# One-command AMD evidence run: ROCm check, smoke test, VisA PCB benchmark and summary.
#
# Run from anywhere inside a Linux AMD GPU environment that already has ROCm PyTorch and
# torchvision installed (do not pip-install a generic torch over it):
#
#   bash scripts/amd_run.sh
#
# Environment overrides:
#   PYTHON=python3                      interpreter that has ROCm PyTorch
#   CATEGORIES="pcb1 pcb2 pcb3 pcb4"    VisA categories to benchmark
#   VISA_DIR=data/datasets/visa         extracted VisA root (downloaded if missing, ~1.9 GB)
#   OUT=data/evidence/visa-amd          where reports, logs and the summary go
#   SKIP_INSTALL=1                      do not pip-install the backend package
#   DRY_RUN_CPU=1                       local rehearsal on CPU; never counts as AMD evidence

set -euo pipefail
cd "$(dirname "$0")/.."

PYTHON=${PYTHON:-python3}
CATEGORIES=${CATEGORIES:-"pcb1 pcb2 pcb3 pcb4"}
VISA_DIR=${VISA_DIR:-data/datasets/visa}
VISA_URL=https://amazon-visual-anomaly.s3.us-west-2.amazonaws.com/VisA_20220922.tar
export TORCH_HOME=${TORCH_HOME:-$PWD/data/torch}

if [[ ${DRY_RUN_CPU:-0} == 1 ]]; then
  DEVICE_ARGS=(--device cpu)
  OUT=${OUT:-work/amd-run-dryrun}
  SMOKE_DIR=$OUT/smoke
else
  DEVICE_ARGS=(--device cuda --require-amd)
  OUT=${OUT:-data/evidence/visa-amd}
  SMOKE_DIR=$OUT/smoke
fi
mkdir -p "$OUT"
exec > >(tee -a "$OUT/run.log") 2>&1
step() { printf '\n==> %s  [%s]\n' "$*" "$(date -u +%H:%M:%SZ)"; }

step "1/6 Environment"
command -v rocm-smi >/dev/null && rocm-smi --showproductname || echo "rocm-smi not found"
"$PYTHON" - "$OUT/environment.json" "${DRY_RUN_CPU:-0}" <<'EOF'
import json, platform, subprocess, sys
import torch
info = {
    "python": platform.python_version(),
    "platform": platform.platform(),
    "torch": torch.__version__,
    "hip": torch.version.hip,
    "gpu_available": torch.cuda.is_available(),
    "gpu_name": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
    "gpu_count": torch.cuda.device_count(),
}
try:
    import torchvision
    info["torchvision"] = torchvision.__version__
except ImportError:
    sys.exit("torchvision is missing. Install the ROCm build matching this torch, not a generic wheel.")
try:
    info["rocm_smi"] = subprocess.run(["rocm-smi", "--showproductname"], capture_output=True, text=True, timeout=30).stdout
except (OSError, subprocess.TimeoutExpired):
    info["rocm_smi"] = None
open(sys.argv[1], "w").write(json.dumps(info, indent=2) + "\n")
print(json.dumps({k: v for k, v in info.items() if k != "rocm_smi"}, indent=2))
if sys.argv[2] != "1" and not (torch.version.hip and torch.cuda.is_available()):
    sys.exit("No AMD ROCm GPU visible to PyTorch (need torch.version.hip and a GPU). Stopping.")
EOF

step "2/6 Backend package"
if [[ ${SKIP_INSTALL:-0} != 1 ]]; then
  # No [ml] extra: keep the vendor ROCm torch/torchvision.
  "$PYTHON" -m pip install --quiet -e './backend[dev]'
fi
"$PYTHON" -c "import worksight; print('worksight importable')"

step "3/6 VisA dataset (CC BY 4.0)"
if [[ ! -f $VISA_DIR/split_csv/1cls.csv ]]; then
  mkdir -p "$VISA_DIR"
  curl -fL "$VISA_URL" | tar -x -C "$VISA_DIR" -f -
fi
"$PYTHON" scripts/visa_manifest.py --visa-root "$VISA_DIR" --split "$VISA_DIR/split_csv/1cls.csv" \
  --output data/datasets/manifests --categories $CATEGORIES

step "4/6 Smoke test through the HTTP API"
"$PYTHON" scripts/smoke.py "${DEVICE_ARGS[@]}" --data-dir "$SMOKE_DIR"

step "5/6 Benchmark"
for category in $CATEGORIES; do
  echo "--- $category"
  "$PYTHON" -m worksight.benchmark --manifest "data/datasets/manifests/$category.json" \
    --output "$OUT/$category.json" "${DEVICE_ARGS[@]}" > /dev/null
done

step "6/6 Summary"
"$PYTHON" - "$OUT" data/evidence/visa-cpu $CATEGORIES <<'EOF'
import json, sys
from pathlib import Path
out, cpu_dir, categories = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3:]
rows, runtime = [], None
for c in categories:
    r = json.loads((out / f"{c}.json").read_text())
    runtime = r["runtime"]
    m, lat = r["metrics"], r["latency"]
    cpu = cpu_dir / f"{c}.json"
    same = None
    if cpu.is_file():
        same = json.loads(cpu.read_text())["reference_hashes"] == r["reference_hashes"]
    rows.append(
        f"| {c} | {m['auroc']:.3f} | {m['f1']:.3f} | {m['false_positive_rate']:.3f} | "
        f"{m['recall']:.3f} | {m['true_positive']} / {m['false_negative']} / {m['false_positive']} / "
        f"{m['true_negative']} | {lat['p50_ms']:.1f} / {lat['p95_ms']:.1f} | {r['onboarding_ms']:.0f} | "
        f"{'n/a' if same is None else 'yes' if same else 'NO'} |"
    )
text = "\n".join([
    f"# VisA benchmark on {runtime['device_name']}",
    "",
    f"Device `{runtime['device']}`, AMD GPU: **{runtime['amd_gpu']}**, HIP {runtime['hip_version']}, "
    f"torch {runtime['torch_version']}, torchvision {runtime['torchvision_version']}, "
    f"encoder `{runtime['encoder']}`.",
    "",
    "| Category | AUROC | F1 | FPR | Recall | TP / FN / FP / TN | p50 / p95 ms | Onboarding ms | Same references as CPU |",
    "|---|---|---|---|---|---|---|---|---|",
    *rows,
    "",
    "Latency: batch 1, warm encoder, preprocessing + encoding + retrieval; excludes disk, network, heatmap.",
])
(out / "summary.md").write_text(text + "\n")
print(text)
if not runtime["amd_gpu"]:
    print("\nNOTE: amd_gpu is false. This run is NOT AMD evidence.")
EOF

step "Done. Evidence in $OUT (environment.json, smoke/, <category>.json, summary.md, run.log)"
cat <<EOF

Serve the API on this GPU for the live demo:
  WORKSIGHT_DEVICE=cuda WORKSIGHT_REQUIRE_AMD=1 WORKSIGHT_API_KEY=<secret> \\
    $PYTHON -m uvicorn worksight.api:app --host 0.0.0.0 --port 8000 --workers 1
EOF
