// BLUN - AI Organisator | MIT License
/**
 * Paperclip -> BLUN Migration Script
 * Idempotent: checks by company name before inserting
 * Skips Autoflashlog (7aea912a...)
 */
const { Pool } = require("pg");
const src = new Pool({
  host: process.env.MIGRATE_SRC_HOST || "localhost",
  port: parseInt(process.env.MIGRATE_SRC_PORT || "5432"),
  database: process.env.MIGRATE_SRC_DB || "paperclip",
  user: process.env.MIGRATE_SRC_USER || "postgres",
  password: process.env.MIGRATE_SRC_PASSWORD || "",
});
const dst = new Pool({
  host: process.env.BLUN_DB_HOST || "localhost",
  port: parseInt(process.env.BLUN_DB_PORT || "5432"),
  database: process.env.BLUN_DB_NAME || "blun",
  user: process.env.BLUN_DB_USER || "postgres",
  password: process.env.BLUN_DB_PASSWORD || "",
});
const SKIP = "7aea912a-6238-46df-ace6-22f716b2e631";
function mapTS(s){if(s==="in_progress"||s==="blocked")return"in_progress";if(s==="done")return"done";if(s==="cancelled")return"cancelled";return"todo";}
function mapP(p){return{critical:4,urgent:3,high:2,medium:1}[p]||0;}
function mapAS(s){if(s==="active")return"active";if(s==="paused")return"paused";return"idle";}
async function run(){
  console.log("=== Paperclip -> BLUN Migration ===\n");
  var cMap={},aMap={},iMap={},cvMap={};
  // 1 companies
  var cs=(await src.query("SELECT * FROM companies WHERE id!=$1 ORDER BY created_at",[SKIP])).rows;
  console.log("[companies] "+cs.length+" found");
  for(var c of cs){
    var ex=(await dst.query("SELECT id FROM companies WHERE name=$1",[c.name])).rows;
    if(ex.length){cMap[c.id]=ex[0].id;console.log("  EXISTS: "+c.name)}
    else{var r=(await dst.query("INSERT INTO companies(name,config,created_at) VALUES($1,$2,$3) RETURNING id",[c.name,"{}",c.created_at])).rows[0];cMap[c.id]=r.id;console.log("  ADDED: "+c.name)}
  }
  // 2 agents
  var as=(await src.query("SELECT * FROM agents WHERE company_id!=$1 ORDER BY created_at",[SKIP])).rows;
  console.log("\n[agents] "+as.length+" found");
  var aa=0,ask=0;
  for(var a of as){
    var nc=cMap[a.company_id];if(!nc){ask++;continue}
    var ex=(await dst.query("SELECT id FROM agents WHERE company_id=$1 AND name=$2",[nc,a.name])).rows;
    if(ex.length){aMap[a.id]=ex[0].id;ask++;continue}
    var cfg=Object.assign({},a.adapter_config||{},a.metadata||{});
    if(a.budget_monthly_cents)cfg.budget_monthly_cents=a.budget_monthly_cents;
    if(a.spent_monthly_cents)cfg.spent_monthly_cents=a.spent_monthly_cents;
    if(a.pause_reason)cfg.pause_reason=a.pause_reason;
    if(a.reports_to)cfg.reports_to=String(a.reports_to);
    var r=(await dst.query("INSERT INTO agents(company_id,name,role,title,status,model,adapter_type,config,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id",
      [nc,a.name,a.role,a.title,mapAS(a.status),null,a.adapter_type||"codex_local",JSON.stringify(cfg),a.created_at,a.updated_at])).rows[0];
    aMap[a.id]=r.id;aa++;
  }
  console.log("  Added: "+aa+", Skipped: "+ask);
  // 3 issues -> tasks
  var is=(await src.query("SELECT * FROM issues WHERE company_id!=$1 ORDER BY created_at",[SKIP])).rows;
  console.log("\n[issues->tasks] "+is.length+" found");
  var ta=0,tsk=0;
  for(var i of is){
    var nc=cMap[i.company_id];if(!nc){tsk++;continue}
    var ex=(await dst.query("SELECT id FROM tasks WHERE company_id=$1 AND title=$2 AND created_at=$3",[nc,i.title,i.created_at])).rows;
    if(ex.length){iMap[i.id]=ex[0].id;tsk++;continue}
    var aid=i.assignee_agent_id?aMap[i.assignee_agent_id]||null:null;
    var r=(await dst.query("INSERT INTO tasks(company_id,agent_id,title,description,status,priority,created_at,updated_at,completed_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id",
      [nc,aid,i.title,i.description,mapTS(i.status),mapP(i.priority),i.created_at,i.updated_at,i.completed_at])).rows[0];
    iMap[i.id]=r.id;ta++;
  }
  console.log("  Added: "+ta+", Skipped: "+tsk);
  // 4 issue_comments -> conversations + messages
  var cms=(await src.query("SELECT ic.*,i.title AS issue_title,i.assignee_agent_id FROM issue_comments ic JOIN issues i ON i.id=ic.issue_id WHERE ic.company_id!=$1 ORDER BY ic.issue_id,ic.created_at",[SKIP])).rows;
  console.log("\n[comments->conversations] "+cms.length+" found");
  var cc=0,ma=0,ms=0;
  for(var cm of cms){
    var nc=cMap[cm.company_id];if(!nc){ms++;continue}
    if(!cvMap[cm.issue_id]){
      var aid=cm.assignee_agent_id?aMap[cm.assignee_agent_id]||null:null;
      var t="Issue: "+(cm.issue_title||"Untitled");
      var ex=(await dst.query("SELECT id FROM conversations WHERE company_id=$1 AND title=$2",[nc,t])).rows;
      if(ex.length){cvMap[cm.issue_id]=ex[0].id}
      else{var r=(await dst.query("INSERT INTO conversations(company_id,agent_id,title,status,created_at) VALUES($1,$2,$3,$4,$5) RETURNING id",[nc,aid,t,"open",cm.created_at])).rows[0];cvMap[cm.issue_id]=r.id;cc++}
    }
    var ex2=(await dst.query("SELECT id FROM conversation_messages WHERE conversation_id=$1 AND body=$2 AND created_at=$3",[cvMap[cm.issue_id],cm.body,cm.created_at])).rows;
    if(ex2.length){ms++;continue}
    var st=cm.author_agent_id?"agent":"user";
    var si=cm.author_agent_id?aMap[cm.author_agent_id]||null:null;
    await dst.query("INSERT INTO conversation_messages(conversation_id,sender_type,sender_id,body,created_at) VALUES($1,$2,$3,$4,$5)",[cvMap[cm.issue_id],st,si,cm.body,cm.created_at]);
    ma++;
  }
  console.log("  Convs: "+cc+", Msgs: "+ma+", Skipped: "+ms);
  // 5 heartbeats
  var hbs=(await src.query("SELECT hr.* FROM heartbeat_runs hr JOIN agents a ON a.id=hr.agent_id WHERE a.company_id!=$1 ORDER BY hr.started_at",[SKIP])).rows;
  console.log("\n[heartbeats] "+hbs.length+" found");
  var ha=0,hs=0;
  var ehb=+(await dst.query("SELECT count(*)::int AS c FROM heartbeats")).rows[0].c;
  for(var h of hbs){
    var na=aMap[h.agent_id];if(!na){hs++;continue}
    if(ehb>0){var ex=(await dst.query("SELECT id FROM heartbeats WHERE agent_id=$1 AND started_at=$2",[na,h.started_at])).rows;if(ex.length){hs++;continue}}
    await dst.query("INSERT INTO heartbeats(agent_id,status,started_at,finished_at,stdout,error) VALUES($1,$2,$3,$4,$5,$6)",[na,h.status,h.started_at,h.finished_at,h.stdout_excerpt,h.error]);
    ha++;
  }
  console.log("  Added: "+ha+", Skipped: "+hs);
  // 6 cost_events
  var ces=(await src.query("SELECT ce.* FROM cost_events ce JOIN agents a ON a.id=ce.agent_id WHERE a.company_id!=$1 ORDER BY ce.created_at",[SKIP])).rows;
  console.log("\n[cost_events] "+ces.length+" found");
  var ca=0,css=0;
  var ec=+(await dst.query("SELECT count(*)::int AS c FROM cost_events")).rows[0].c;
  for(var ce of ces){
    var na=aMap[ce.agent_id];if(!na){css++;continue}
    if(ec>0){var ex=(await dst.query("SELECT id FROM cost_events WHERE agent_id=$1 AND created_at=$2 AND provider=$3",[na,ce.created_at,ce.provider])).rows;if(ex.length){css++;continue}}
    await dst.query("INSERT INTO cost_events(agent_id,provider,model,input_tokens,output_tokens,cost_cents,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)",[na,ce.provider,ce.model,ce.input_tokens,ce.output_tokens,ce.cost_cents,ce.created_at]);
    ca++;
  }
  console.log("  Added: "+ca+", Skipped: "+css);
  console.log("\n=== Summary ===");
  console.log("Companies: "+Object.keys(cMap).length);
  console.log("Agents: "+aa);console.log("Tasks: "+ta);
  console.log("Conversations: "+cc+", Messages: "+ma);
  console.log("Heartbeats: "+ha);console.log("Costs: "+ca);
  console.log("\nDone.");
  await src.end();await dst.end();
}
run().catch(e=>{console.error("FATAL:",e);process.exit(1)});
