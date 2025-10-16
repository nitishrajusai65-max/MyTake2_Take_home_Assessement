const express = require('express');
const app = express();
app.use(express.json());

// --- Configuration ---
const PORT = 3000;
const HEALTH_CHECK_INTERVAL_MS = 10000; // Check health every 10 seconds
const LATENCY_THRESHOLD_MS = 1500; // Models slower than this are considered unhealthy

// --- In-Memory State Management ---

// Describes the interview simulations and their model preferences.
// In a real system, this would come from a database.
const simulationConfigs = {
  'sim-101-finance': {
    id: 'sim-101-finance',
    name: 'Financial Analyst Interview',
    primaryModel: 'gpt-4o',
    secondaryModel: 'claude-3-sonnet',
  },
  'sim-202-engineering': {
    id: 'sim-202-engineering',
    name: 'Software Engineer Interview',
    primaryModel: 'claude-3-sonnet',
    secondaryModel: 'gpt-4o',
  },
};

// Holds the current health status of each LLM. This is our central state.
const modelHealthStatus = {
  'gpt-4o': { status: 'UNKNOWN', latency: null },
  'claude-3-sonnet': { status: 'UNKNOWN', latency: null },
};

// --- Mock LLM Health Checker ---

/**
 * Mocks a health check call to an LLM provider's API.
 * It simulates network latency and potential failures.
 * @param {string} modelName - The name of the model to check.
 * @returns {Promise<{success: boolean, latency: number}>}
 */
function mockCheckLLMHealth(modelName) {
  console.log(`[Health Check] Pinging ${modelName}...`);
  return new Promise(resolve => {
    // Simulate variable network delay
    const delay = 50 + Math.random() * 500;

    setTimeout(() => {
      // Simulate a 15% chance of the API failing or being too slow
      if (Math.random() < 0.15) {
        resolve({ success: false, latency: 5000 + Math.random() * 1000 });
      } else {
        // Successful response with realistic latency
        const latency = 100 + Math.random() * 400;
        resolve({ success: true, latency: Math.round(latency) });
      }
    }, delay);
  });
}

// --- Health Monitoring Logic ---

/**
 * Iterates through all models, checks their health, and updates the state.
 */
async function updateAllModelsHealth() {
  for (const modelName in modelHealthStatus) {
    const result = await mockCheckLLMHealth(modelName);
    if (result.success && result.latency < LATENCY_THRESHOLD_MS) {
      modelHealthStatus[modelName] = { status: 'HEALTHY', latency: result.latency };
      console.log(`[Health Check] ${modelName} | Status: HEALTHY, Latency: ${result.latency}ms`);
    } else {
      modelHealthStatus[modelName] = { status: 'UNHEALTHY', latency: result.latency };
      console.log(`[Health Check] ${modelName} | Status: UNHEALTHY, Latency: ${result.latency}ms (Threshold: ${LATENCY_THRESHOLD_MS}ms)`);
    }
  }
}

// --- API Endpoint ---

/**
 * The core endpoint for the Python agent.
 * It resolves which model should be used for a given simulation
 * based on the primary model's current health.
 */
app.post('/api/resolve-model', (req, res) => {
  const { simulationId } = req.body;

  if (!simulationId) {
    return res.status(400).json({ error: 'simulationId is required' });
  }

  const config = simulationConfigs[simulationId];
  if (!config) {
    return res.status(404).json({ error: `Simulation config for '${simulationId}' not found.` });
  }

  const primaryModel = config.primaryModel;
  const health = modelHealthStatus[primaryModel];

  if (health.status === 'HEALTHY') {
    console.log(`[Resolver] Primary model '${primaryModel}' is healthy. Assigning to interview.`);
    res.json({
      modelToUse: primaryModel,
      fallbackOccurred: false,
      reason: `Primary model '${primaryModel}' is healthy.`,
      details: health,
    });
  } else {
    const secondaryModel = config.secondaryModel;
    console.log(`[FALLBACK] Primary model '${primaryModel}' is UNHEALTHY. Falling back to '${secondaryModel}'.`);
    // TODO: Add a check for the secondary model's health as a safety measure.
    res.json({
      modelToUse: secondaryModel,
      fallbackOccurred: true,
      reason: `Primary model '${primaryModel}' is unhealthy (Status: ${health.status}, Latency: ${health.latency}ms).`,
      details: health,
    });
  }
});

// --- Server Initialization ---

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  // Perform an initial health check on startup, then set the interval.
  console.log('[Health Check] Performing initial health checks...');
  updateAllModelsHealth().then(() => {
    setInterval(updateAllModelsHealth, HEALTH_CHECK_INTERVAL_MS);
    console.log(`[Health Check] Background health checks scheduled every ${HEALTH_CHECK_INTERVAL_MS / 1000} seconds.`);
  });
});
