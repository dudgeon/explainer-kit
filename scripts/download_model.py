#!/usr/bin/env python3
"""Download one pinned model from Hugging Face (or the mirror in HF_ENDPOINT), and when it fails, say why in plain words
instead of a traceback: which host refused, the status code, and what to try.
  <python with huggingface_hub> -I scripts/download_model.py <repo> <revision> <dest> [--files a,b,...]
Exit 0 on success, 1 on a failure it explains. KIT_DEBUG=1 shows the full traceback as well."""
import argparse, os, sys
from urllib.parse import urlparse

ap = argparse.ArgumentParser()
ap.add_argument("repo")
ap.add_argument("revision")
ap.add_argument("dest")
ap.add_argument("--files", default="", help="comma-separated file names to fetch (default: the whole repository)")
a = ap.parse_args()

endpoint = os.environ.get("HF_ENDPOINT") or "https://huggingface.co"
host = urlparse(endpoint).netloc or endpoint
MIRROR = ("Behind a company network, point the kit at your model mirror: set HF_ENDPOINT to its address and run setup "
          "again (the README's \"Behind a company network\" section).")


def explain(e):
    status, url = None, None
    resp = getattr(e, "response", None)
    if resp is not None:
        status, url = getattr(resp, "status_code", None), getattr(resp, "url", None)
    where = urlparse(str(url)).netloc if url else host
    text = f"{type(e).__name__}: {e}".lower()
    what = f"{a.repo} at {a.revision[:10]}"
    if status in (401, 403):
        return [f"{where} refused the download of {what} (HTTP {status}).",
                "The host wants a sign-in, or your network blocks this model.", MIRROR]
    if status == 404:
        return [f"{where} has no {what} (HTTP 404).",
                "A mirror may not carry this model, or not this exact version. The kit pins each model to one version "
                "and checks every file's fingerprint, so another version won't do; ask whoever runs the mirror for this one."]
    if status:
        return [f"{where} answered HTTP {status} for {what}.", "Try again in a while; if it keeps failing: " + MIRROR]
    if "ssl" in text or "certificate" in text:
        return [f"The certificate check for {where} failed.",
                "A company network that inspects traffic needs its own certificate bundle: set SSL_CERT_FILE and "
                "REQUESTS_CA_BUNDLE to it. Inside an agent's sandbox (Claude Code's, say) certificate checks fail too: "
                "run ./setup.sh in Terminal."]
    if any(w in text for w in ("connection", "resolve", "timed out", "timeout", "network", "proxy", "offline")):
        return [f"Couldn't reach {where} to download {what}.",
                "Check the internet connection and any proxy settings (HTTPS_PROXY). " + MIRROR]
    return [f"Downloading {what} from {where} failed: {type(e).__name__}: {str(e).splitlines()[0] if str(e) else ''}",
            "Run again with KIT_DEBUG=1 to see the full error."]


try:
    from huggingface_hub import snapshot_download
    snapshot_download(a.repo, revision=a.revision, local_dir=a.dest,
                      allow_patterns=[f for f in a.files.split(",") if f] or None)
except Exception as e:  # noqa: BLE001 - every failure gets a plain explanation
    if os.environ.get("KIT_DEBUG") == "1":
        import traceback
        traceback.print_exc()
    lines = explain(e)
    print(f"download: {lines[0]}", file=sys.stderr)
    for l in lines[1:]:
        print(f"  {l}", file=sys.stderr)
    sys.exit(1)
