import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// 6.10.14.13: preserve required authorization checks; only use temporary rules.
// Replacing a helper with an apparently equivalent function is NOT proof of equivalence.
const original = await readFile("firestore.rules", "utf8");
const start = original.indexOf("      // Reject self-promotion before any self-update or admin-management branch.");
const end = original.indexOf("      allow delete:", start);
if (start < 0 || end <= start) throw new Error("usuarios update block not found");
const block = original.slice(start, end);
const anchor = "canAdminEmpresaManageUser(resource.data, request.resource.data)";
if (block.split(anchor).length !== 2) throw new Error("Expected one company helper reference");

const helper = `
    // TEMPORARY EMULATOR PROBE 6.10.14.13 — do not deploy.
    function stage6101413CompanyManage(existingData, newData) {
      let actorPath = /databases/$(database)/documents/usuarios/$(request.auth.uid);
      let actor = isSignedIn() && exists(actorPath) ? get(actorPath).data : {};
      let perfil = "perfil" in actor
        && actor.perfil is string && actor.perfil.size() > 0 ? actor.perfil : null;
      let empresa = "empresa_id" in actor
        && actor.empresa_id is string && actor.empresa_id.size() > 0 ? actor.empresa_id : null;
      return isSignedIn()
        && (!("status" in actor) || actor.status == "Ativo")
        && perfil == "Administrador da Empresa"
        && existingData.perfil != "Administrador Geral"
        && newData.perfil != "Administrador Geral"
        && existingData.empresa_id == empresa
        && newData.empresa_id == empresa
        && isUsuarioVinculoValido(newData);
    }
`;
const helperStatusLast = helper.replace(
  '        && (!("status" in actor) || actor.status == "Ativo")\n        && perfil == "Administrador da Empresa"',
  '        && perfil == "Administrador da Empresa"\n        && (!("status" in actor) || actor.status == "Ativo")',
);
const variants = [["baseline", null]];
const dir = await mkdtemp(join(tmpdir(), "patio-rules-6101413-"));
for (const [name, fn] of [
  ["cached-actor", helper],
  ["cached-actor-role-first", helperStatusLast],
]) {
  const path = join(dir, name + ".rules");
  const replacement = block.replace(anchor, "stage6101413CompanyManage(resource.data, request.resource.data)");
  await writeFile(path, original.slice(0, start) + fn + replacement + original.slice(end));
  variants.push([name, path]);
}
const prefix = resolve(process.env.PATIO_RULES_EXPERIMENT_PREFIX || "/tmp/patio-rules-6101413");
const results = {};
for (const [name, path] of variants) {
  results[name] = {};
  for (const [kind, focus] of [["security", "usuarios"], ["legitimate", "usuarios-validacao"]]) {
    const reportPrefix = prefix + "-" + name + "-" + kind;
    const env = { ...process.env, PATIO_RULES_FOCUS: focus, PATIO_RULES_REPORT_PREFIX: reportPrefix };
    delete env.PATIO_RULES_TEST_RULES_PATH;
    delete env.PATIO_RULES_STRICT;
    if (path) env.PATIO_RULES_TEST_RULES_PATH = path;
    process.stdout.write("\n=== " + name + " / " + kind + " (Emulator only) ===\n");
    const run = spawnSync("npm", ["run", "test:rules:diagnose"], { env, stdio: "inherit" });
    if (run.error) throw run.error;
    const summary = JSON.parse(await readFile(reportPrefix + "-summary.json", "utf8"));
    const log = await readFile(reportPrefix + ".log", "utf8");
    const individual = [];
    let pending = null;
    let diagnostics = [];
    for (const line of log.split("\n")) {
      if (line.includes("maximum of 1000 expressions to evaluate has been reached"))
        diagnostics.push("budget");
      else if (line.includes("evaluation error at L")) diagnostics.push("evaluation-error");
      const match = line.match(/^# Subtest: (.*)$/);
      if (match) {
        if (pending) individual.push(pending);
        pending = { name: match[1], precedingDiagnostics: diagnostics, status: null };
        diagnostics = [];
      }
      const status = line.match(/^(ok|not ok) \d+ - /);
      if (status && pending) pending.status = status[1];
    }
    if (pending) individual.push(pending);
    results[name][kind] = {
      testExitCode: summary.testExitCode, exitCode: run.status,
      evaluationErrorMentions: summary.evaluationErrorMentions,
      expressionBudgetMentions: summary.expressionBudgetMentions,
      log: reportPrefix + ".log", report: reportPrefix + "-summary.json", individual,
    };
  }
}
const acceptance = Object.entries(results).filter(([name]) => name !== "baseline").map(([name, suites]) => ({
  name,
  existingTestSuitesPass: Object.values(suites).every(x => x.exitCode === 0 && x.testExitCode === 0),
  noBudget: Object.values(suites).every(x => x.expressionBudgetMentions === 0),
  noEvaluationErrorIncrease: Object.keys(suites).every(k => suites[k].evaluationErrorMentions <= results.baseline[k].evaluationErrorMentions),
}));
const comparison = {
  stage: "6.10.14.13", emulatorOnly: true, officialRulesUnchanged: true,
  deployableCandidates: [], variants: Object.fromEntries(variants.slice(1)),
  results, acceptance,
  warning: "These variants are experimental and unproven. A successful assertFails can hide rule evaluation failures. No deployment or official rule changes.",
};
await writeFile(prefix + "-comparison.json", JSON.stringify(comparison, null, 2) + "\n");
process.stdout.write("\nCOMPARISON " + JSON.stringify(comparison, null, 2) + "\n");
if (!acceptance.some(x => x.existingTestSuitesPass && x.noBudget && x.noEvaluationErrorIncrease)) process.exitCode = 1;
