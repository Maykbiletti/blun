/**
 * Hardware Profile Detection
 * MKI-058 - Automatically detects server tier: weak/medium/strong/gpu
 */

'use strict';

const os = require('os');
const fs = require('fs');
const { execSync } = require('child_process');

// Tier thresholds
const TIERS = {
  GPU:    { name: 'gpu',    label: 'GPU Server' },
  STRONG: { name: 'strong', label: 'Strong Server' },
  MEDIUM: { name: 'medium', label: 'Medium Server' },
  WEAK:   { name: 'weak',   label: 'Weak Server' },
};

function getCpuInfo() {
  const cpus = os.cpus();
  return {
    count: cpus.length,
    model: cpus[0]?.model || 'unknown',
    speedMHz: cpus[0]?.speed || 0,
  };
}

function getRamGiB() {
  return os.totalmem() / (1024 ** 3);
}

function detectGpus() {
  const gpus = [];

  // NVIDIA via nvidia-smi
  try {
    const out = execSync(
      'nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits 2>/dev/null',
      { timeout: 3000, encoding: 'utf8' }
    );
    out.trim().split('\n').forEach(line => {
      const [name, vramMiB] = line.split(',').map(s => s.trim());
      if (name) gpus.push({ vendor: 'nvidia', name, vramMiB: parseInt(vramMiB, 10) || 0 });
    });
  } catch (_) { /* no nvidia-smi */ }

  // AMD via rocm-smi
  if (gpus.length === 0) {
    try {
      const out = execSync('rocm-smi --showproductname 2>/dev/null', { timeout: 3000, encoding: 'utf8' });
      if (out.includes('GPU')) gpus.push({ vendor: 'amd', name: 'AMD GPU (rocm)', vramMiB: 0 });
    } catch (_) { /* no rocm */ }
  }

  // Fallback: check /proc/driver/nvidia or /dev/dri
  if (gpus.length === 0) {
    try {
      if (fs.existsSync('/proc/driver/nvidia/version')) {
        gpus.push({ vendor: 'nvidia', name: 'NVIDIA GPU (/proc)', vramMiB: 0 });
      } else if (fs.existsSync('/dev/dri/renderD128')) {
        gpus.push({ vendor: 'generic', name: 'DRI GPU (/dev/dri)', vramMiB: 0 });
      }
    } catch (_) { /* fs check failed */ }
  }

  return gpus;
}

function classifyTier(cpuCount, ramGiB, gpus) {
  if (gpus.length > 0) return TIERS.GPU;

  if (cpuCount >= 16 && ramGiB >= 32) return TIERS.STRONG;
  if (cpuCount >= 4  && ramGiB >= 8)  return TIERS.MEDIUM;
  return TIERS.WEAK;
}

/**
 * Returns a hardware profile object describing the current machine.
 *
 * @returns {{
 *   tier: string,
 *   label: string,
 *   cpu: { count: number, model: string, speedMHz: number },
 *   ramGiB: number,
 *   gpus: Array<{ vendor: string, name: string, vramMiB: number }>,
 *   platform: string,
 *   arch: string,
 *   hostname: string,
 *   detectedAt: string
 * }}
 */
function detectHardwareProfile() {
  const cpu   = getCpuInfo();
  const ram   = getRamGiB();
  const gpus  = detectGpus();
  const tier  = classifyTier(cpu.count, ram, gpus);

  return {
    tier:       tier.name,
    label:      tier.label,
    cpu,
    ramGiB:     parseFloat(ram.toFixed(2)),
    gpus,
    platform:   os.platform(),
    arch:       os.arch(),
    hostname:   os.hostname(),
    detectedAt: new Date().toISOString(),
  };
}

/**
 * Suggested concurrency limits per tier (for agent task scheduling).
 */
const CONCURRENCY_DEFAULTS = {
  weak:   2,
  medium: 6,
  strong: 16,
  gpu:    32,
};

function getRecommendedConcurrency(tier) {
  return CONCURRENCY_DEFAULTS[tier] ?? CONCURRENCY_DEFAULTS.weak;
}

module.exports = {
  detectHardwareProfile,
  getRecommendedConcurrency,
  TIERS,
  CONCURRENCY_DEFAULTS,
};

// Allow direct execution for quick diagnostics
if (require.main === module) {
  const profile = detectHardwareProfile();
  console.log(JSON.stringify(profile, null, 2));
  console.log(`\nRecommended concurrency: ${getRecommendedConcurrency(profile.tier)}`);
}
