import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// 6.10.14.16: shared actor-context experiment across ALL usuarios.update branches.
// Original firestore.rules is NEVER modified; generated rules are NOT deployable.
const original = await readFile("firestore.rules", "utf8");
const start = original.indexOf("      // Reject self-promotion before any self-update or admin-management branch.");
const end = original.indexOf("      allow delete:", start);
if (start < 0 || end <= start) throw new Error("usuarios.update block not found");
const block = original.slice(start, end);
const startExpression = '      allow update: if isSignedIn()';
if (!block.includes(startExpression)) throw new Error("Unexpected allow update expression");
const endExpression = '\n        );';
if (!block.includes(endExpression)) throw new Error("Unexpected allow update end");

const helper = `
    // TEMPORARY 6.10.14.16 diagnostic helper — never deploy.
    function stage161UpdateUser(id, oldData, newData) {
      let actorPath = /databases/$(database)/documents/usuarios/$(request.auth.uid);
      let actorExists = isSignedIn() && exists(actorPath);
      let actor = actorExists ? get(actorPath).data : {};
      let actorStatusOk = actorExists && (!("status" in actor) || actor.status == "Ativo");
      let actorRole = actorExists && "perfil" in actor && actor.perfil is string
        && actor.perfil.size() > 0 ? actor.perfil : null;
      let actorEmpresa = actorExists && "empresa_id" in actor && actor.empresa_id is string
        && actor.empresa_id.size() > 0 ? actor.empresa_id : null;
      return isSignedIn()
        && !(request.auth.uid == id
          && oldData.get("perfil", null) != "Administrador Geral"
          && newData.get("perfil", null) == "Administrador Geral")
        && (
          (
            request.auth.uid == id
            && newData.id == oldData.id
            && newData.nome == oldData.nome
            && newData.email == oldData.email
            && newData.perfil == oldData.perfil
            && newData.empresa_id == oldData.empresa_id
            && newData.status == oldData.status
            && newData.criado_em == oldData.criado_em
            && newData.diff(oldData).affectedKeys().hasOnly([
              "supermercado_id", "supermercado_ids", "atualizado_em"
            ])
            && actorStatusOk
            && (
              newData.supermercado_id == oldData.supermercado_id
              || isSupermercadoDaEmpresaAtivo(oldData.empresa_id, newData.supermercado_id)
              || (oldData.perfil == "Administrador Geral" && newData.supermercado_id == null)
              || (oldData.perfil == "Administrador da Empresa" && newData.supermercado_id == null)
            )
          )
          || (
            oldData.perfil == "Administrador da Empresa"
            && newData.perfil == oldData.perfil
            && newData.empresa_id == oldData.empresa_id
            && hasOnlyUserManagementChanges(oldData, newData)
            && actorStatusOk
            && actorRole == "Administrador Geral"
            && oldData.convite_token is string
            && oldData.convite_token.size() > 0
            && newData.convite_token == oldData.convite_token
            && isUsuarioVinculoValido(newData)
          )
          || (
            oldData.perfil != "Administrador Geral"
            && newData.perfil != "Administrador Geral"
            && hasOnlyUserManagementChanges(oldData, newData)
            && actorStatusOk
            && actorRole == "Administrador da Empresa"
            && oldData.empresa_id == actorEmpresa
            && newData.empresa_id == actorEmpresa
            && isUsuarioVinculoValido(newData)
          )
        );
    }
`;
const candidateBlock = block.slice(0, block.indexOf(startExpression)) +
  '      allow update: if stage161UpdateUser(id, resource.data, request.resource.data);\n\n';
const tempDir = await mkdtemp(join(tmpdir(), "patio-rules-6101416-"));
const candidatePath = join(tempDir, "shared-actor-update.rules");
await writeFile(candidatePath, original.slice(0, start) + helper + candidateBlock + original.slice(end));

const testCases = [
  ["register-platform", "usuarios", "^user cannot self-register as platform admin$"],
  ["promote-platform", "usuarios", "^user cannot promote own profile to platform admin$"],
  ["self-timestamp", "usuarios-validacao", "^610149 self user updates allowed timestamp$"],
  ["self-promotion", "usuarios-validacao", "^610149 user cannot promote own profile$"],
  ["same-company", "usuarios-validacao", "^610149 company admin manages same-company user$"],
  ["other-company", "usuarios-validacao", "^610149 company admin cannot manage other company$"],
  ["platform-invite", "usuarios-validacao", "^610149 platform admin manages invited company admin$"],
  ["ordinary-user", "usuarios-validacao", "^610149 ordinary user cannot change others privileges$"],
  ["admin-self", "usuarios-validacao", "^610149 company admin self-management regression probe$"],
];
const prefix = resolve(process.env.PATIO_RULES_EXPERIMENT_PREFIX || "/tmp/patio-rules-6101416");
const results = {};
for (const [variant, rulePath] of [["baseline", null], ["shared-actor-update", candidatePath]]) {
  results[variant] = {};
  for (const [id, focus, pattern] of testCases) {
    const reportPrefix = prefix + "-" + variant + "-" + id;
    const env = {
      ...process.env, PATIO_RULES_FOCUS: focus,
      PATIO_RULES_TEST_PATTERN: pattern,
      PATIO_RULES_REPORT_PREFIX: reportPrefix,
    };
    delete env.PATIO_RULES_TEST_RULES_PATH;
    delete env.PATIO_RULES_STRICT;
    if (rulePath) env.PATIO_RULES_TEST_RULES_PATH = rulePath;
    process.stdout.write("\n=== " + variant + " / " + id + " (Emulator) ===\n");
    const run = spawnSync("npm", ["run", "test:rules:diagnose"], { env, stdio: "inherit" });
    if (run.error) throw run.error;
    const summary = JSON.parse(await readFile(reportPrefix + "-summary.json", "utf8"));
    const log = await readFile(reportPrefix + ".log", "utf8");
    const ok = (log.match(/^ok \d+ - .+$/gm) || []).filter(line => !line.includes("# SKIP")).length;
    const failed = (log.match(/^not ok \d+ - /gm) || []).length;
    results[variant][id] = {
      exitCode: run.status, testExitCode: summary.testExitCode, passed: ok, failed,
      expressionBudgetMentions: summary.expressionBudgetMentions,
      evaluationErrorMentions: summary.evaluationErrorMentions,
      log: reportPrefix + ".log",
      summary: reportPrefix + "-summary.json",
      coverage: summary.coverage_json || null,
    };
  }
}
const regression = testCases.map(([id]) => {
  const baseline = results.baseline[id], candidate = results["shared-actor-update"][id];
  return {
    id, baseline, candidate,
    behaviorPreserved: baseline.passed === 1 && baseline.failed === 0 &&
      candidate.passed === 1 && candidate.failed === 0 && candidate.exitCode === 0,
    budgetReduced: candidate.expressionBudgetMentions < baseline.expressionBudgetMentions,
    newEvaluationError: candidate.evaluationErrorMentions > baseline.evaluationErrorMentions,
  };
});
const report = {
  stage: "6.10.14.16", emulatorOnly: true, officialRulesUnchanged: true,
  candidatePath, deployableCandidates: [], cases: regression,
  provisionalOnly: regression.every(x => x.behaviorPreserved && !x.newEvaluationError) &&
    regression.every(x => x.candidate.expressionBudgetMentions === 0),
  warning: "A provisional result is NOT authorization equivalence. assertFails can hide evaluation errors; the required broad negative-case matrix has not been completed. DO NOT deploy or merge the generated rules.",
};
await writeFile(prefix + "-comparison.json", JSON.stringify(report, null, 2) + "\n");
process.stdout.write("\nCOMPARISON\n" + JSON.stringify(regression.map(x => ({
  id: x.id, behaviorPreserved: x.behaviorPreserved,
  budgetBefore: x.baseline.expressionBudgetMentions, budgetAfter: x.candidate.expressionBudgetMentions,
  errorsBefore: x.baseline.evaluationErrorMentions, errorsAfter: x.candidate.evaluationErrorMentions,
})), null, 2) + "\n");
if (!report.provisionalOnly) process.exitCode = 1;
