"""
llm.py
------
One client for every LLM the app can use -- cloud or local. They all speak
the OpenAI-compatible /chat/completions API (including tool calling).

Configure in backend/.env:

  Cloud (auto-detected from the key prefix):
      LLM_API_KEY=gsk_...      -> Groq     (free tier, llama-3.3-70b-versatile)
      LLM_API_KEY=sk-...       -> OpenAI   (gpt-4o-mini)
      LLM_API_KEY=xai-...      -> xAI      (grok-3-mini)
      LLM_API_KEY=sk-or-...    -> OpenRouter

  Local (no key, runs on your machine, private):
      LLM_PROVIDER=ollama               # uses http://localhost:11434/v1
      LLM_MODEL=llama3.1                # any model you've pulled with `ollama pull`
    or LM Studio / llama.cpp / vLLM:
      LLM_BASE_URL=http://localhost:1234/v1
      LLM_MODEL=<model name>

  Optional:  LLM_MODEL, LLM_BASE_URL, LLM_TIMEOUT (seconds)

If nothing is configured or a call fails, functions return None and callers
use their offline, rule-based behaviour -- the app never breaks.
"""
from __future__ import annotations
import json
import logging
import os
from typing import Optional

from . import env  # noqa: F401  (loads backend/.env)

log = logging.getLogger("llm")

_PROVIDERS = {
    "gsk_": ("Groq", "https://api.groq.com/openai/v1", "llama-3.3-70b-versatile"),
    "xai-": ("xAI", "https://api.x.ai/v1", "grok-3-mini"),
    "sk-or-": ("OpenRouter", "https://openrouter.ai/api/v1", "openai/gpt-4o-mini"),
    "sk-": ("OpenAI", "https://api.openai.com/v1", "gpt-4o-mini"),
}
_LOCAL_PRESETS = {
    "ollama": ("Ollama (local)", "http://localhost:11434/v1", "llama3.1"),
    "lmstudio": ("LM Studio (local)", "http://localhost:1234/v1", "local-model"),
}

_last_error: Optional[str] = None
_tools_unsupported: set[str] = set()


def _config() -> Optional[dict]:
    key = (os.environ.get("LLM_API_KEY") or os.environ.get("GROQ_API_KEY") or os.environ.get("OPENAI_API_KEY")
           or os.environ.get("XAI_API_KEY") or "").strip()
    if key.startswith("your-") or key == "changeme":
        key = ""
    provider = (os.environ.get("LLM_PROVIDER") or "").strip().lower()
    base = (os.environ.get("LLM_BASE_URL") or "").strip().rstrip("/")
    model = (os.environ.get("LLM_MODEL") or os.environ.get("XAI_MODEL") or os.environ.get("OPENAI_MODEL") or "").strip()

    if provider in _LOCAL_PRESETS:
        name, p_base, p_model = _LOCAL_PRESETS[provider]
        return {"name": name, "key": key or "local", "base": base or p_base, "model": model or p_model, "local": True}
    if base and not key and any(h in base for h in ("localhost", "127.0.0.1", "0.0.0.0", "host.docker.internal")):
        return {"name": "Local model", "key": "local", "base": base, "model": model or "local-model", "local": True}
    if not key:
        return None
    name, p_base, p_model = "OpenAI-compatible", "https://api.openai.com/v1", "gpt-4o-mini"
    for prefix, (p_name, b, m) in _PROVIDERS.items():
        if key.startswith(prefix):
            name, p_base, p_model = p_name, b, m
            break
    return {"name": name, "key": key, "base": base or p_base, "model": model or p_model, "local": False}


def is_enabled() -> bool:
    return _config() is not None


def status() -> dict:
    cfg = _config()
    if not cfg:
        return {"enabled": False, "provider": None, "model": None, "local": False, "last_error": _last_error}
    return {"enabled": True, "provider": cfg["name"], "model": cfg["model"], "local": cfg["local"], "last_error": _last_error}


def _post(cfg: dict, payload: dict) -> Optional[dict]:
    global _last_error
    import requests
    timeout = int(os.environ.get("LLM_TIMEOUT") or (90 if cfg["local"] else 25))
    try:
        resp = requests.post(
            f"{cfg['base']}/chat/completions",
            headers={"Authorization": f"Bearer {cfg['key']}", "Content-Type": "application/json"},
            json={"model": cfg["model"], **payload},
            timeout=timeout,
        )
        if resp.status_code >= 400:
            _last_error = f"{resp.status_code}: {resp.text[:240]}"
            log.warning("LLM call failed: %s", _last_error)
            return None
        _last_error = None
        return resp.json()["choices"][0]["message"]
    except Exception as e:  # network error, timeout, bad JSON...
        _last_error = f"{type(e).__name__}: {str(e)[:200]}"
        log.warning("LLM call failed: %s", _last_error)
        return None


def chat(messages: list[dict], temperature: float = 0.5, max_tokens: int = 600) -> Optional[str]:
    cfg = _config()
    if not cfg:
        return None
    msg = _post(cfg, {"messages": messages, "temperature": temperature, "max_tokens": max_tokens})
    content = (msg or {}).get("content")
    return content.strip() if content else None


def chat_with_tools(messages: list[dict], tools: list[dict], temperature: float = 0.2, max_tokens: int = 700) -> Optional[dict]:
    """
    Returns the assistant message dict ({"content", "tool_calls"}) or None.
    If a provider/model rejects tool calling, that's remembered and None is
    returned so the caller can fall back to plain chat + rules.
    """
    cfg = _config()
    if not cfg or cfg["model"] in _tools_unsupported:
        return None
    msg = _post(cfg, {"messages": messages, "tools": tools, "tool_choice": "auto", "temperature": temperature, "max_tokens": max_tokens})
    if msg is None and _last_error and any(w in _last_error.lower() for w in ("tool", "function")):
        _tools_unsupported.add(cfg["model"])
    if msg is None:
        return None
    calls = []
    for c in msg.get("tool_calls") or []:
        fn = c.get("function") or {}
        args = fn.get("arguments") or "{}"
        try:
            parsed = json.loads(args) if isinstance(args, str) else dict(args)
        except json.JSONDecodeError:
            parsed = {}
        calls.append({"id": c.get("id") or fn.get("name"), "name": fn.get("name"), "arguments": parsed, "raw": c})
    return {"content": (msg.get("content") or "").strip(), "tool_calls": calls, "raw": msg}
