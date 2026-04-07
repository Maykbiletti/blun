"use strict";
var cp = require("child_process");
var fss = require("fs");
var path = require("path");

// Sandbox: Only allow safe, read-only commands
var ALLOWED_BASH = /^(ls|cat|head|tail|grep|find|wc|echo|node\s|npm\s+test|git\s+(status|log|diff|branch))\b/;
var BLOCKED_BASH = /[;&|`$]|\.\./;  // block chaining, subshells, path traversal

// Sandbox: Restrict file access to project + tmp
var ALLOWED_READ_PATHS = ["/root/blun/", "/tmp/"];

function runBash(cmd) {
  // Sandbox enforcement
  var trimmed = cmd.trim();
  if (!ALLOWED_BASH.test(trimmed) || BLOCKED_BASH.test(trimmed)) {
    return Promise.resolve("BLOCKED: Command not in sandbox allowlist");
  }
  return new Promise(function(res) {
    cp.exec(cmd, {cwd:"/root/blun",timeout:30000,maxBuffer:200000}, function(e,o,er){
      res((o||"")+(er||"")+(e?" [exit "+e.code+"]":""));
    });
  });
}

// Regex: \[TOOL:X:([^\]]+)\] — matches [TOOL:X:anything_except_bracket]
var bs = String.fromCharCode(92);
var reBash = new RegExp(bs+"[TOOL:BASH:([^"+bs+"]]+"+")" + bs+"]", "i");
var reRead = new RegExp(bs+"[TOOL:FILE_READ:([^"+bs+"]]+"+")" + bs+"]", "i");
var reGit  = new RegExp(bs+"[TOOL:GIT_COMMIT:([^"+bs+"]]+"+")" + bs+"]", "i");

module.exports = {
  parseLine: function(line, cmds) {
    var m;
    if ((m = line.match(reBash))) cmds.push({tool:"bash", cmd:m[1].trim()});
    if ((m = line.match(reRead))) cmds.push({tool:"file_read", path:m[1].trim()});
    if ((m = line.match(reGit)))  cmds.push({tool:"git_commit", msg:m[1].trim()});
  },
  handleCmd: async function(cmd, results) {
    if (cmd.tool === "bash") {
      var out = await runBash(cmd.cmd);
      results.push("BASH: " + out.substring(0,2000));
    } else if (cmd.tool === "file_read") {
      // Sandbox: restrict file reads to allowed paths
      var resolved = path.resolve(cmd.path);
      if (!ALLOWED_READ_PATHS.some(function(p) { return resolved.startsWith(p); })) {
        results.push("FILE_ERR: Access denied — path outside sandbox: " + cmd.path);
      } else {
        try { results.push("FILE: " + fss.readFileSync(resolved,"utf8").substring(0,3000)); }
        catch(e) { results.push("FILE_ERR: "+e.message); }
      }
    } else if (cmd.tool === "git_commit") {
      // Sandbox: sanitize commit message — only safe chars
      var gm = cmd.msg.replace(/[^a-zA-Z0-9äöüÄÖÜß\s\-_.,:!()#\/]/g, "");
      if (!gm) { results.push("GIT_ERR: Commit message empty after sanitizing"); return; }
      var go = await runBash('git add -A && git commit -m "' + gm + '" && git push origin main 2>&1');
      results.push("GIT: " + go.substring(0,1000));
    }
  }
};
