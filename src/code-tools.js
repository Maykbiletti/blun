"use strict";
var cp = require("child_process");
var fss = require("fs");

function runBash(cmd) {
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
      try { results.push("FILE: " + fss.readFileSync(cmd.path,"utf8").substring(0,3000)); }
      catch(e) { results.push("FILE_ERR: "+e.message); }
    } else if (cmd.tool === "git_commit") {
      var gm = cmd.msg.replace(/"/g, "");
      var go = await runBash('git add -A && git commit -m "' + gm + '" && git push origin main 2>&1');
      results.push("GIT: " + go.substring(0,1000));
    }
  }
};
