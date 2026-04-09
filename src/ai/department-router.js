// BLUN Department Router — classifies tasks to departments, picks agent
var DEPARTMENTS = {
  MANAGEMENT: { keywords: ["strateg","priorit","plan","roadmap","decision","ceo","vision","coordinate"], agents: ["operator","ceo"] },
  MARKETING_SEO: { keywords: ["funnel","ads","seo","campaign","positioning","content-strat","launch","growth","marketing","conversion"], agents: ["growth"] },
  VIDEO_MEDIA: { keywords: ["video","creative","script","visual-content","animation","media"], agents: ["designer"] },
  DESIGN_FRONTEND: { keywords: ["ui","ux","layout","component","frontend","css","design","landingpage","responsive","styling"], agents: ["designer","dev"] },
  BACKEND_CODING: { keywords: ["api","backend","database","route","endpoint","bug","fix","server-logic","middleware","sql","migration"], agents: ["dev"] },
  INFRA_DEVOPS: { keywords: ["deploy","server","nginx","pm2","docker","ci","cd","monitoring","scaling","infrastructure","ssl"], agents: ["dev"] },
  KI_MODELS: { keywords: ["multi-ki","routing","model","prompt","llama","inference","ai-provider","embedding","fine-tun","lora"], agents: ["dev"] },
  QA_TESTING: { keywords: ["test","bug-detect","functional-test","system-test","regression","e2e"], agents: ["qa"] },
  QUALITY_CONTROL: { keywords: ["quality","review","output-bewertung","logikpruef","ergebnis"], agents: ["qa"] },
  BUSINESS_SALES: { keywords: ["pricing","angebot","monetarisierung","deal","billing","stripe","subscription","invoice"], agents: ["growth","ceo"] },
  MOBILE_DESKTOP: { keywords: ["mobile","electron","app","ios","android","desktop","pwa"], agents: ["dev","designer"] },
  AGENT_SYSTEM: { keywords: ["agent","operator","task-system","role","heartbeat","spawn","worktree","paperclip"], agents: ["dev","operator"] },
  OTHER: { keywords: [], agents: ["dev"] }
};

function classifyDepartment(taskText) {
  var lower = (taskText || "").toLowerCase();
  var scores = {};
  Object.keys(DEPARTMENTS).forEach(function(dept) {
    if (dept === "OTHER") return;
    var hits = 0;
    DEPARTMENTS[dept].keywords.forEach(function(kw) {
      if (lower.includes(kw)) hits++;
    });
    if (hits > 0) scores[dept] = hits;
  });
  var sorted = Object.entries(scores).sort(function(a, b) { return b[1] - a[1]; });
  if (sorted.length === 0) return { department: "OTHER", confidence: 0, agents: DEPARTMENTS.OTHER.agents };
  return { department: sorted[0][0], confidence: sorted[0][1], agents: DEPARTMENTS[sorted[0][0]].agents, alternatives: sorted.slice(1, 3).map(function(s) { return { department: s[0], score: s[1] }; }) };
}

function routeTask(taskText) {
  var dept = classifyDepartment(taskText);
  return { department: dept.department, primaryAgent: dept.agents[0], fallbackAgents: dept.agents.slice(1), confidence: dept.confidence, alternatives: dept.alternatives || [] };
}

module.exports = { classifyDepartment, routeTask, DEPARTMENTS };
