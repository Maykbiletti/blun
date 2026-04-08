"use strict";
var cp = require("child_process");
var fss = require("fs");
var path = require("path");
var { query, queryOne } = require("./db");

// Sandbox: Only allow safe, read-only commands
var ALLOWED_BASH = /^(ls|cat|head|tail|grep|find|wc|echo|node\s|npm\s+test|git\s+(status|log|diff|branch|remote|add|commit|push))\b/;
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
var reWrite = /\[TOOL:FILE_WRITE:([^|]+)\|([^\]]+)\]/i;
var reList = /\[TOOL:LIST_FILES:([^\]]+)\]/i;

module.exports = {
  parseLine: function(line, cmds) {
    var m;
    if ((m = line.match(reBash))) cmds.push({tool:"bash", cmd:m[1].trim()});
    if ((m = line.match(reRead))) cmds.push({tool:"file_read", path:m[1].trim()});
    if ((m = line.match(reGit)))  cmds.push({tool:"git_commit", msg:m[1].trim()});
    if ((m = line.match(reWrite))) cmds.push({tool:"file_write", path:m[1].trim(), content:m[2]});
    if ((m = line.match(reList))) cmds.push({tool:"list_files", dir:m[1].trim()});
  },
  handleCmd: async function(cmd, results, agentId) {
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
    } else if (cmd.tool === "file_write") {
      var resolved = path.resolve(cmd.path);
      if (!ALLOWED_READ_PATHS.some(function(p) { return resolved.startsWith(p); })) {
        results.push("FILE_ERR: Access denied — path outside sandbox: " + cmd.path);
      } else {
        try {
          // Backup before write
          if (fss.existsSync(resolved)) {
            var bak = resolved + '.bak_agent_' + new Date().toISOString().substring(0,10).replace(/-/g,'');
            if (!fss.existsSync(bak)) fss.copyFileSync(resolved, bak);
          }
          var dir = path.dirname(resolved);
          if (!fss.existsSync(dir)) fss.mkdirSync(dir, {recursive:true});
          fss.writeFileSync(resolved, cmd.content, "utf8");
          results.push("FILE_WRITTEN: " + cmd.path + " (" + cmd.content.length + " chars)");
        } catch(e) { results.push("FILE_ERR: " + e.message); }
      }
    } else if (cmd.tool === "list_files") {
      var resolved = path.resolve(cmd.dir);
      if (!ALLOWED_READ_PATHS.some(function(p) { return resolved.startsWith(p); })) {
        results.push("FILE_ERR: Access denied — dir outside sandbox");
      } else {
        try {
          var files = fss.readdirSync(resolved).slice(0,50);
          results.push("FILES: " + files.join(", "));
        } catch(e) { results.push("FILE_ERR: " + e.message); }
      }
    } else if (cmd.tool === "git_commit") {
      // Sandbox: sanitize commit message
      var gm = cmd.msg.replace(/[^a-zA-Z0-9äöüÄÖÜß\s\-_.,:!()#\/]/g, "");
      if (!gm) { results.push("GIT_ERR: Commit message empty after sanitizing"); return; }
      // Read SSH key + git URL from user_connections DB
      var sshKey = "/root/.ssh/id_ed25519_github_pro";
      var gitUrl = "blun-pro";
      try {
        if (agentId) {
          var agentRow = await queryOne("SELECT company_id FROM blun_agents WHERE id = $1", [agentId]);
          if (agentRow && agentRow.company_id) {
            var gitConn = await queryOne("SELECT config FROM user_connections WHERE type = 'git' AND company_id = $1 ORDER BY id LIMIT 1", [agentRow.company_id]);
            if (gitConn && gitConn.config) {
              var cfg = typeof gitConn.config === 'string' ? JSON.parse(gitConn.config) : gitConn.config;
              if (cfg.ssh_key) sshKey = cfg.ssh_key;
              if (cfg.url) gitUrl = cfg.url;
            }
          }
        }
      } catch(dbErr) { console.error("[git_commit] DB lookup:", dbErr.message); }
      var pushCmd = 'BLUN_DEPLOYER=dieter git add -A && BLUN_DEPLOYER=dieter git commit -m "' + gm + '" && GIT_SSH_COMMAND="ssh -i ' + sshKey + ' -o StrictHostKeyChecking=no" git push ' + gitUrl + ' main 2>&1';
      var go = await new Promise(function(res){ cp.exec(pushCmd, {cwd:"/root/blun",timeout:60000,maxBuffer:500000}, function(e,o,er){ res((o||"")+( er||"")+( e?" [exit "+e.code+"]":"")); }); });
      results.push("GIT: " + go.substring(0,1000));
    }
  }
};
