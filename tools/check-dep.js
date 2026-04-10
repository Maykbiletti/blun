#!/usr/bin/env node
// Check if a module can be resolved from /root/blun
// Usage: node check-dep.js <moduleName>
try {
  require.resolve(process.argv[2], { paths: ['/root/blun'] });
  process.exit(0);
} catch (e) {
  process.exit(2);
}
