import { spawn } from "node:child_process";

// Shells out to a headless LLM CLI (default: `claude -p --output-format json`)
// per the reference plan's "AI layer" design: one process per agent step,
// prompts checked into the repo as playbooks, structured output parsed back.
export function callLlm(config, prompt) {
  const cmd = config.llm?.command || "claude";
  const args = config.llm?.args || ["-p", "--output-format", "json"];

  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d));
    proc.stderr.on("data", (d) => (stderr += d));
    proc.on("error", (err) => reject(new Error(`Failed to launch "${cmd}": ${err.message}`)));
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`"${cmd}" exited ${code}: ${stderr.slice(0, 2000)}`));
        return;
      }
      resolve(stdout);
    });
    proc.stdin.write(prompt);
    proc.stdin.end();
  });
}

// Headless CLI JSON output formats vary (raw JSON, or an envelope with a
// "result"/"content" field holding text that itself contains JSON). Try the
// obvious shapes, then fall back to extracting the first {...} or [...] block.
export function extractJson(raw) {
  const tryParse = (s) => {
    try {
      return JSON.parse(s);
    } catch {
      return undefined;
    }
  };

  let val = tryParse(raw.trim());
  if (val !== undefined) {
    if (typeof val === "object" && val !== null) {
      const inner = val.result ?? val.content ?? val.output ?? val.text;
      if (typeof inner === "string") {
        const parsedInner = tryParse(inner.trim()) ?? extractJsonBlock(inner);
        if (parsedInner !== undefined) return parsedInner;
      }
    }
    return val;
  }

  const block = extractJsonBlock(raw);
  if (block !== undefined) return block;

  throw new Error(`Could not extract JSON from LLM output:\n${raw.slice(0, 2000)}`);
}

function extractJsonBlock(text) {
  const match = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (!match) return undefined;
  try {
    return JSON.parse(match[1]);
  } catch {
    return undefined;
  }
}
