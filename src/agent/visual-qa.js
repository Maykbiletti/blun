// BLUN Agent System — Visual QA Pipeline
const { query, queryOne } = require("../db");

var _saveAgentMemory = null;
var _sendAgentMessage = null;
var _callLLM = null;
function setDeps(deps) {
  _saveAgentMemory = deps.saveAgentMemory;
  _sendAgentMessage = deps.sendAgentMessage;
  _callLLM = deps.callLLM;
}

// === VISUAL QA: Screenshot + AI Analysis Pipeline ===
async function visualQACheck(agentId, url, description) {
  // 1. Take screenshot via Playwright on server
  var cp = require('child_process');
  var fs = require('fs');
  var screenshotPath = '/tmp/visual_qa_' + agentId + '_' + Date.now() + '.png';

  try {
    // Use Playwright to screenshot
    var playwrightScript = 'const{chromium}=require("playwright");(async()=>{const b=await chromium.launch({args:["--no-sandbox"]});const p=await b.newPage();await p.setViewportSize({width:1920,height:1080});await p.goto("' + url.replace(/"/g, '\\"') + '",{timeout:15000,waitUntil:"networkidle"});await p.screenshot({path:"' + screenshotPath + '",fullPage:false});await b.close()})()';

    cp.execSync('node -e \'' + playwrightScript.replace(/'/g, "\\'") + '\'', {timeout: 30000, cwd: '/root/blun'});

    if (!fs.existsSync(screenshotPath)) {
      return {ok: false, error: 'Screenshot failed'};
    }

    // 2. Analyze with LLM vision (describe what we see)
    var screenshotBase64 = fs.readFileSync(screenshotPath).toString('base64');

    var analysisPrompt = 'Analysiere diesen Screenshot kritisch. Checkliste:\n' +
      '1) Alignment: Elemente buendig?\n' +
      '2) Spacing: Gleichmaessig?\n' +
      '3) Text: Lesbar, kein Overflow?\n' +
      '4) Buttons: Konsistent?\n' +
      '5) Farben: Konsistent, lesbar?\n' +
      '6) Leerraum: Balanced?\n' +
      '7) Doppelte Elemente?\n' +
      '8) Gesamteindruck: Professionell?\n' +
      'Beschreibung der Seite: ' + (description || 'Dashboard') + '\n' +
      'Antworte mit VISUAL:PASS oder VISUAL:FAIL + Liste der Probleme.';

    // For now, store screenshot path for manual review
    // Full vision API integration depends on model capability
    var result = {
      ok: true,
      screenshot: screenshotPath,
      url: url,
      agent_id: agentId,
      timestamp: new Date().toISOString()
    };

    // Save to agent memory for tracking
    await _saveAgentMemory(agentId, 'last_visual_qa', JSON.stringify(result), ['visual_qa'], 'qa');

    // Clean up old screenshots (keep last 10)
    try {
      var files = fs.readdirSync('/tmp').filter(function(f) { return f.startsWith('visual_qa_'); }).sort();
      if (files.length > 10) {
        for (var i = 0; i < files.length - 10; i++) {
          fs.unlinkSync('/tmp/' + files[i]);
        }
      }
    } catch(e) {}

    return result;
  } catch(e) {
    return {ok: false, error: e.message};
  }
}

// Auto Visual QA after frontend agent completes a task
async function autoVisualQA(agentId, taskResult) {
  // Only for frontend/design agents
  var agent = await queryOne("SELECT department FROM blun_agents WHERE id = $1", [agentId]);
  if (!agent || (agent.department !== 'Frontend & Design' && agent.department !== 'Mobile')) return null;

  // Check if task touched HTML/CSS files
  var lower = (taskResult || '').toLowerCase();
  if (lower.indexOf('.html') === -1 && lower.indexOf('.css') === -1 && lower.indexOf('dashboard') === -1) return null;

  // Run visual QA on dashboard
  var result = await visualQACheck(agentId, 'http://localhost:3200', 'BLUN Dashboard nach Frontend-Aenderung');
  if (result.ok) {
    console.log('[visual-qa] Screenshot saved: ' + result.screenshot);
    // Send to QA agent (Helmut) for review
    await _sendAgentMessage(agentId, 29, 'Visual QA Check', 'Frontend-Aenderung von Agent ' + agentId + '. Screenshot: ' + result.screenshot + '. Bitte visuell pruefen.', 'normal', null);
  }
  return result;
}


module.exports = { visualQACheck, autoVisualQA, setDeps };
