// dashboard/js/agent-manager.js

// Assuming there is a modal with the ID 'agent-modal'
// Using Bootstrap modal events as an example
$('#agent-modal').on('hidden.bs.modal', function () {
  refreshAgentStatus();
});

function refreshAgentStatus() {
  // Assuming there is an element to display the status, e.g., <span id="agent-status-icon"></span>
  const statusIcon = document.getElementById('agent-status-icon');
  const statusText = document.getElementById('agent-status-text');

  if (!statusIcon || !statusText) {
    console.error('Status elements not found');
    return;
  }

  // Set loading state
  statusText.textContent = 'Refreshing...';
  statusIcon.className = 'status-icon loading'; // Use a class to show a loading spinner

  // Fetch new agent status from the API
  // Assuming the agent ID is available, e.g. from a data attribute on the modal
  const agentId = $('#agent-modal').data('agent-id');
  if (!agentId) {
      console.error('Agent ID not found');
      statusText.textContent = 'Error';
      return;
  }

  fetch(`/api/agents/${agentId}/status`)
    .then(response => {
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      return response.json();
    })
    .then(data => {
      // Update the UI with the new status
      updateAgentStatusUI(data.status);
    })
    .catch(error => {
      console.error('Error fetching agent status:', error);
      statusText.textContent = 'Error';
      statusIcon.className = 'status-icon error';
    });
}

function updateAgentStatusUI(status) {
  const statusIcon = document.getElementById('agent-status-icon');
  const statusText = document.getElementById('agent-status-text');

   if (!statusIcon || !statusText) {
    return;
  }

  statusText.textContent = status;
  statusIcon.className = `status-icon ${status.toLowerCase()}`; // e.g., 'status-icon online'
}

// Example on how to trigger this:
// 1. A button opens the modal and sets the agent-id
// $('#agent-modal').data('agent-id', 123).modal('show');
