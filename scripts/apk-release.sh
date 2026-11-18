#!/usr/bin/env bash
# Windows ninja/CMake hits MAX_PATH (~260) with New Architecture codegen under a deep
# project path. Build via a short junction (C:\da) so object paths stay under the limit.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

IS_WINDOWS=0
case "$(uname -s 2>/dev/null || echo unknown)" in
  MINGW*|MSYS*|CYGWIN*) IS_WINDOWS=1 ;;
esac
if [[ "${OS:-}" == "Windows_NT" ]]; then
  IS_WINDOWS=1
fi

if [[ "$IS_WINDOWS" -eq 1 ]]; then
  SHORT_ROOT="/c/da"
  # mklink needs a real Windows path with backslashes (pwd -W uses forward slashes).
  if command -v cygpath >/dev/null 2>&1; then
    WIN_ROOT="$(cygpath -w "$PROJECT_DIR")"
  else
    WIN_ROOT="$(cd "$PROJECT_DIR" && pwd -W | sed 's|/|\\|g')"
  fi
  CURRENT_TARGET=""
  if [[ -e "$SHORT_ROOT" || -L "$SHORT_ROOT" ]]; then
    CURRENT_TARGET="$(cmd.exe //c "fsutil reparsepoint query C:\\da" 2>/dev/null | tr -d '\r' | sed -n 's/^Druckname:[[:space:]]*//p' || true)"
  fi
  # Normalize for comparison (case/slash insensitive).
  norm() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | tr '/' '\\' | sed 's/\\$//'; }
  if [[ "$(norm "$CURRENT_TARGET")" != "$(norm "$WIN_ROOT")" ]]; then
    if [[ -e "$SHORT_ROOT" || -L "$SHORT_ROOT" ]]; then
      cmd.exe //c "rmdir C:\\da" >/dev/null 2>&1 || true
    fi
    cmd.exe //c "mklink /J C:\\da ${WIN_ROOT}"
  fi
  cd "$SHORT_ROOT"
else
  cd "$PROJECT_DIR"
fi

TASK="${1:-assembleRelease}"
if [[ $# -gt 0 ]]; then
  shift
fi

exec npx react-native build-android --tasks "$TASK" "$@"
