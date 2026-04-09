// BLUN Collaboration Engine — enforces handoff chain, blocker tracking, cross-dept splits
var deptRouter = require("./department-router");

// Standard flow: Operator → Department → Agent → QA → Integrator → Memory → Operator
var STANDARD_FLOW = ["operator", "department", "agent", "qa", "integrator", "memory", "operator"];

// Handoff record
function createHandoff(from, to, task, context, output, limits, nextRequired) {
  return {
    from: from,
    to: to,
    task: task,
    context: context || "",
    output: output || "",
    limits: limits || "",
    nextRequired: nextRequired || "",
    createdAt: new Date().toISOString()
  };
}

// Blocker record
function createBlocker(agentId, department, description, waitingFor) {
  return {
    agentId: agentId,
    department: department,
    description: description,
    waitingFor: waitingFor,
    createdAt: new Date().toISOString(),
    resolved: false
  };
}

// Split cross-department task into atomic work packages
function splitCrossDeptTask(taskText, departments) {
  var packages = [];
  var order = 1;
  departments.forEach(function(dept) {
    packages.push({
      id: "WP-" + order,
      department: dept,
      routing: deptRouter.routeTask(taskText + " " + dept),
      order: order,
      status: "pending",
      dependsOn: order > 1 ? "WP-" + (order - 1) : null
    });
    order++;
  });
  // Always add QA + Integration at end
  packages.push({ id: "WP-" + order, department: "QA_TESTING", routing: { primaryAgent: "qa" }, order: order, status: "pending", dependsOn: "WP-" + (order - 1) });
  order++;
  packages.push({ id: "WP-" + order, department: "INTEGRATION", routing: { primaryAgent: "integrator" }, order: order, status: "pending", dependsOn: "WP-" + (order - 1) });
  return packages;
}

// Validate task completion
function isTaskComplete(task) {
  return task.dodMet === true && task.qaStatus === "PASS" && task.integratorConfirmed === true;
}

module.exports = { createHandoff, createBlocker, splitCrossDeptTask, isTaskComplete, STANDARD_FLOW };
