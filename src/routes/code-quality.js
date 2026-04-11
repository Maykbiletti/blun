const express = require("express");
const fs = require("fs/promises");
const path = require("path");

const router = express.Router();

const ROOT_DIR = "/root/blun/src";

function countLines(content) {
  if (!content) return 0;
  return content.split(/\r?\n/).length;
}

async function collectJsFiles(dir, files) {
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      await collectJsFiles(fullPath, files);
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(fullPath);
    }
  }
}

router.get("/code-quality", async (req, res) => {
  try {
    const jsFiles = [];
    await collectJsFiles(ROOT_DIR, jsFiles);

    const fileStats = [];
    let totalLines = 0;

    for (const filePath of jsFiles) {
      const content = await fs.readFile(filePath, "utf8");
      const lines = countLines(content);
      totalLines += lines;
      fileStats.push({
        path: filePath,
        relativePath: path.relative(ROOT_DIR, filePath),
        lines
      });
    }

    fileStats.sort((a, b) => b.lines - a.lines);

    const jsFileCount = jsFiles.length;
    const averageFileLength = jsFileCount === 0 ? 0 : Number((totalLines / jsFileCount).toFixed(2));

    res.json({
      root: ROOT_DIR,
      scannedAt: new Date().toISOString(),
      jsFiles: jsFileCount,
      totalLines,
      averageFileLength,
      largestFiles: fileStats.slice(0, 10)
    });
  } catch (error) {
    res.status(500).json({
      error: "Code quality scan failed",
      details: error.message
    });
  }
});

module.exports = router;
