# AMD access — checked 17 October 2026

The [ACT III page](https://lablab.ai/ai-hackathons/amd-developer-hackathon-act-iii/)
points participants to [Token Factory](https://notebooks.amd.com/tokenfactory), says no billing/card
is needed and that $100 credits are not needed to use that API. It separately describes direct
AMD Developer Cloud / PyTorch / ROCm workloads.

A hosted-model API key does not establish access to run Worksight's own torchvision encoder.
The public Token Factory page requires sign-in and advertises GPU-powered Jupyter notebooks.
This team's custom-PyTorch notebook/VM access has **not** been verified after login.

## Check now

1. Sign in using the AMD AI Developer Program account used for the hackathon.
2. Check the dashboard/onboarding messages for GPU Notebook, Jupyter terminal or a GPU VM.
   A hosted model catalogue and API key alone are insufficient for this backend.
3. If only model APIs are available, ask event mentors about **custom PyTorch inference on ROCm**.
4. If existing cloud credits are already allocated, inspect available GPU instances in that account.

Suggested message for a team member to send (not sent automatically):

> We are Desert Eagles, building Worksight for Intelligent Industry. Our core workload is a frozen
> torchvision visual encoder plus anomaly-memory retrieval in PyTorch, not a hosted LLM. Does ACT III
> provide a GPU notebook or VM where we can run our own ROCm PyTorch code? How can we activate it today?
> We currently see the Token Factory access instructions.

AMD's [credit request guide](https://www.amd.com/en/developer/resources/technical-articles/2026/how-to-claim-amd-cloud-credits.html)
says **Member Perks → Request Cloud Credits**, then 2–3 business days for approval. This is the ordinary
program route, not a verified event-specific SLA. Do not assume a new request finishes before deadline.

## Verify actual execution

Shortest path: `bash scripts/amd_run.sh` (see [BENCHMARK.md](BENCHMARK.md)). Manual steps:

```bash
python -c 'import torch; print({"torch": torch.__version__, "hip": torch.version.hip, "gpu_available": torch.cuda.is_available()}); assert torch.version.hip and torch.cuda.is_available(); print(torch.cuda.get_device_name(0))'
python -m pip install -e './backend[dev]'
export TORCH_HOME=./data/torch
python scripts/smoke.py --device cuda --require-amd --data-dir work/amd-smoke
```

Keep the GPU environment's compatible ROCm PyTorch. Do not install a generic torch wheel over it.
Run the real-data benchmark after smoke; synthetic fixtures prove execution, not industrial quality.

PyTorch's [`cuda` interface is reused for HIP](https://docs.pytorch.org/docs/stable/notes/hip.html).
CPU and Apple MPS are local development options and never reported as AMD inference.
