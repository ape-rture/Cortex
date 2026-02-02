import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const configPath = path.join(root, "context", "model-routing.json");
const summaryPath = path.join(root, "context", "model-routing.md");

const errors = [];

function requireField(obj, field, label) {
  if (obj == null || !(field in obj)) {
    errors.push(`Missing ${label}`);
  }
}

const raw = fs.readFileSync(configPath, "utf8");
const config = JSON.parse(raw);

requireField(config, "version", "version");
requireField(config, "updated_at", "updated_at");
requireField(config, "routing_mode", "routing_mode");
requireField(config, "providers", "providers");
requireField(config, "routes", "routes");

if (config.routing_mode !== "hybrid") {
  errors.push("routing_mode must be hybrid");
}

const providers = config.providers || {};
const providerKeys = Object.keys(providers);
if (providerKeys.length === 0) {
  errors.push("providers must not be empty");
}

for (const [providerName, provider] of Object.entries(providers)) {
  if (provider && provider.enabled === false) {
    continue;
  }
  const models = (provider || {}).models || {};
  for (const [modelName, model] of Object.entries(models)) {
    const id = (model || {}).api_model_id || "";
    if (!id || id === "TBD") {
      errors.push(`Missing api_model_id for ${providerName}:${modelName}`);
    }
  }
}

const policyRules = config.policy_rules || [];
const hasLocalOnly = policyRules.some((rule) => rule && rule.id === "local_only_personal");
if (!hasLocalOnly) {
  errors.push("policy_rules must include local_only_personal");
}

const summary = fs.readFileSync(summaryPath, "utf8");
const updatedMatch = summary.match(/Last updated:\s*(\d{4}-\d{2}-\d{2})/);
if (!updatedMatch) {
  errors.push("model-routing.md is missing Last updated date");
} else if (updatedMatch[1] !== config.updated_at) {
  errors.push(`model-routing.md Last updated (${updatedMatch[1]}) does not match model-routing.json updated_at (${config.updated_at})`);
}

if (!summary.includes("Canonical config: context/model-routing.json")) {
  errors.push("model-routing.md must declare the canonical config path");
}

if (errors.length > 0) {
  console.error("Routing config validation failed:");
  for (const err of errors) {
    console.error(`- ${err}`);
  }
  process.exit(1);
}

console.log("Routing config validation passed.");
