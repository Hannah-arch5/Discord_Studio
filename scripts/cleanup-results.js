import "dotenv/config";
import { cleanupProjectResults, cleanupTaskResults } from "../src/cleanup.js";

const [scope, ...valueParts] = process.argv.slice(2);
const value = valueParts.join(" ").trim();

if (!scope || !value || !["task", "project"].includes(scope)) {
  console.error("Usage: npm run cleanup:results -- task <task_id>");
  console.error("   or: npm run cleanup:results -- project <project_name>");
  process.exit(1);
}

const result = scope === "task"
  ? await cleanupTaskResults(value.replace(/^#/, ""))
  : await cleanupProjectResults(value);

console.log(`Cleaned ${result.removed.length} local result files.`);
console.log(`Tasks: ${result.taskIds.map((id) => `#${id}`).join(", ") || "none"}`);
