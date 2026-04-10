#!/bin/bash
# BLUN Model Merge Pipeline — mergekit
# Sandra — QA/Testing

set -euo pipefail

MODELS_DIR="${MODELS_DIR:-/root/models}"
CONFIG_DIR="${CONFIG_DIR:-/root/blun/config/mergekit}"
LOG_DIR="${LOG_DIR:-/root/logs/mergekit}"
MERGE_OUTPUT_DIR="${MERGE_OUTPUT_DIR:-${MODELS_DIR}/merged}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="${LOG_DIR}/merge_${TIMESTAMP}.log"

mkdir -p "$MODELS_DIR" "$CONFIG_DIR" "$LOG_DIR" "$MERGE_OUTPUT_DIR"

log() {
  local level="$1"
  shift
  local msg="$@"
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] [$level] $msg" | tee -a "$LOG_FILE"
}

log INFO "Model Merge Pipeline started"

check_mergekit() {
  if ! command -v mergekit-yaml &> /dev/null; then
    log ERROR "mergekit not found. Installing..."
    pip install mergekit --quiet || {
      log ERROR "Failed to install mergekit"
      exit 1
    }
  fi
  log INFO "mergekit available"
}

validate_merge_config() {
  local config="$1"
  if [[ ! -f "$config" ]]; then
    log ERROR "Config not found: $config"
    return 1
  fi
  log INFO "Config validated: $config"
  return 0
}

run_merge() {
  local config="$1"
  local output_name="$2"
  local output_path="${MERGE_OUTPUT_DIR}/${output_name}"

  log INFO "Starting merge: $config -> $output_name"

  if mergekit-yaml "$config" "$output_path" 2>&1 | tee -a "$LOG_FILE"; then
    log INFO "Merge completed: $output_path"
    echo "$output_path"
    return 0
  else
    log ERROR "Merge failed: $config"
    return 1
  fi
}

cleanup_old_merges() {
  local max_age=${1:-7}
  log INFO "Cleaning merges older than $max_age days"
  find "$MERGE_OUTPUT_DIR" -maxdepth 1 -type d -mtime +$max_age -exec rm -rf {} \; 2>/dev/null || true
  log INFO "Cleanup complete"
}

main() {
  check_mergekit

  if [[ $# -eq 0 ]]; then
    log ERROR "Usage: $0 <config_file> <output_name> [--cleanup-days N]"
    exit 1
  fi

  local config_file="$1"
  local output_name="$2"
  local cleanup_days=7

  if [[ $# -gt 2 ]]; then
    case "$3" in
      --cleanup-days)
        cleanup_days="${4:-7}"
        ;;
    esac
  fi

  validate_merge_config "$config_file" || exit 1
  run_merge "$config_file" "$output_name" || exit 1
  cleanup_old_merges "$cleanup_days"

  log INFO "Pipeline completed successfully"
}

main "$@"
