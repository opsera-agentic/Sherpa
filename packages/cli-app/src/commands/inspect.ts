import fs from 'node:fs';
import path from 'node:path';
import type { LoggerOptions } from '../logger.js';
import { createLogger } from '../logger.js';
import { getSherpaDir, loadSherpaConfig } from '@sherpa/core-config';
import { BaseAdapter, createDefaultAdapterRegistry, type AdapterContext } from '@sherpa/core-adapters';
import { scanForSecrets } from '@sherpa/core-memory';
import { loadSkills } from '@sherpa/core-skills';
import { withTelemetry } from '../telemetry.js';

export interface InspectCommandOptions extends LoggerOptions {
  projectRoot: string;
  agent?: string;
  sources?: boolean;
}

interface SourceFileMetric {
  path: string;
  exists: boolean;
  sizeBytes: number;
  lineCount: number;
  estimatedTokens: number;
  updatedAt: string | null;
  secretsDetected: boolean;
}

interface SourceMetrics {
  conventions: SourceFileMetric;
  decisions: {
    count: number;
    sizeBytes: number;
    lineCount: number;
    estimatedTokens: number;
    latestUpdatedAt: string | null;
    secretsDetected: boolean;
  };
  skills: {
    count: number;
    names: string[];
    sizeBytes: number;
    lineCount: number;
    estimatedTokens: number;
    latestUpdatedAt: string | null;
    secretsDetected: boolean;
  };
  latestUpdatedAt: string | null;
}

interface AgentInspectMetric {
  agent: string;
  filePath: string;
  enabled: boolean;
  exists: boolean;
  status: 'healthy' | 'missing' | 'stale' | 'manual_edit' | 'warning';
  generatedBySherpa: boolean;
  stale: boolean;
  manualEditsDetected: boolean;
  snapshotExists: boolean;
  sizeBytes: number;
  lineCount: number;
  estimatedTokens: number;
  updatedAt: string | null;
  valid: boolean;
  secretsDetected: boolean;
  sourceCoverage: {
    conventionsIncluded: boolean;
    decisionsIncluded: number;
    decisionsTotal: number;
    skillsIncluded: number;
    skillsTotal: number;
  };
  warnings: string[];
  recommendedAction: string | null;
}

interface InspectReport {
  sources: SourceMetrics;
  agents: AgentInspectMetric[];
}

interface DecisionSource {
  content: string;
  mtimeMs: number;
}

interface WorkspaceSources {
  conventions: string;
  conventionsMtimeMs: number;
  decisions: DecisionSource[];
  skills: ReturnType<typeof loadSkills>;
  latestSourceMtimeMs: number;
  sourceMetrics: SourceMetrics;
}

export async function runInspect(opts: InspectCommandOptions): Promise<void> {
  await withTelemetry(opts.projectRoot, 'inspect', async () => {
    return await _runInspect(opts);
  });
}

async function _runInspect(opts: InspectCommandOptions): Promise<Record<string, unknown>> {
  const logger = createLogger('inspect', opts);
  const sherpaDir = getSherpaDir(opts.projectRoot);
  if (!fs.existsSync(sherpaDir)) {
    const message = 'Sherpa not initialized — run `sherpa init` first';
    logger.error('inspect', message);
    throw new Error(message);
  }

  const config = loadSherpaConfig(opts.projectRoot);
  const workspace = readWorkspaceSources(opts.projectRoot, sherpaDir);
  const report: InspectReport = {
    sources: workspace.sourceMetrics,
    agents: opts.sources ? [] : inspectAgents(opts.projectRoot, sherpaDir, config.adapters.disabled, opts.agent, workspace),
  };

  if (opts.json) {
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } else {
    printReport(report, Boolean(opts.sources));
  }

  return inspectTelemetryMetadata(opts, report);
}

function inspectTelemetryMetadata(opts: InspectCommandOptions, report: InspectReport): Record<string, unknown> {
  const agents = report.agents;
  const sourceSecretsDetected =
    report.sources.conventions.secretsDetected || report.sources.decisions.secretsDetected || report.sources.skills.secretsDetected;

  return {
    inspectScope: opts.sources ? 'sources' : opts.agent ? 'single-agent' : 'all-agents',
    sourcesOnly: Boolean(opts.sources),
    singleAgent: Boolean(opts.agent),
    conventionsPresent: report.sources.conventions.exists,
    decisionCount: report.sources.decisions.count,
    skillCount: report.sources.skills.count,
    sourceTokens: totalSourceTokens(report.sources),
    sourceBytes: report.sources.conventions.sizeBytes + report.sources.decisions.sizeBytes + report.sources.skills.sizeBytes,
    sourceLines: report.sources.conventions.lineCount + report.sources.decisions.lineCount + report.sources.skills.lineCount,
    sourceSecretsDetected,
    agentsInspected: agents.length,
    healthyAgents: agents.filter((agent) => agent.status === 'healthy').length,
    missingAgents: agents.filter((agent) => !agent.exists).length,
    staleAgents: agents.filter((agent) => agent.stale).length,
    manualEditAgents: agents.filter((agent) => agent.manualEditsDetected).length,
    invalidAgents: agents.filter((agent) => !agent.valid).length,
    agentsWithWarnings: agents.filter((agent) => agent.warnings.length > 0).length,
    agentWarningCount: agents.reduce((sum, agent) => sum + agent.warnings.length, 0),
    agentSecretsDetected: agents.filter((agent) => agent.secretsDetected).length,
    generatedBySherpaAgents: agents.filter((agent) => agent.generatedBySherpa).length,
    snapshotBackedAgents: agents.filter((agent) => agent.snapshotExists).length,
    recommendedActionAgents: agents.filter((agent) => agent.recommendedAction).length,
    agentTokens: agents.reduce((sum, agent) => sum + agent.estimatedTokens, 0),
    agentBytes: agents.reduce((sum, agent) => sum + agent.sizeBytes, 0),
    agentLines: agents.reduce((sum, agent) => sum + agent.lineCount, 0),
    sourceCoverageConventionsIncluded: agents.filter((agent) => agent.sourceCoverage.conventionsIncluded).length,
    sourceCoverageDecisionsIncluded: agents.reduce((sum, agent) => sum + agent.sourceCoverage.decisionsIncluded, 0),
    sourceCoverageDecisionSlots: agents.reduce((sum, agent) => sum + agent.sourceCoverage.decisionsTotal, 0),
    sourceCoverageSkillsIncluded: agents.reduce((sum, agent) => sum + agent.sourceCoverage.skillsIncluded, 0),
    sourceCoverageSkillSlots: agents.reduce((sum, agent) => sum + agent.sourceCoverage.skillsTotal, 0),
  };
}

function readWorkspaceSources(projectRoot: string, sherpaDir: string): WorkspaceSources {
  const conventionsPath = path.join(sherpaDir, 'conventions.md');
  const conventions = fs.existsSync(conventionsPath) ? fs.readFileSync(conventionsPath, 'utf8') : '';
  const conventionsStat = statOrNull(conventionsPath);

  const decisionsDir = path.join(sherpaDir, 'decisions');
  const decisions: DecisionSource[] = [];
  if (fs.existsSync(decisionsDir)) {
    for (const file of fs.readdirSync(decisionsDir).filter((name) => name.endsWith('.md')).sort()) {
      const fullPath = path.join(decisionsDir, file);
      const stat = statOrNull(fullPath);
      decisions.push({
        content: fs.readFileSync(fullPath, 'utf8').trim(),
        mtimeMs: stat?.mtimeMs ?? 0,
      });
    }
  }

  const skillFiles = readSkillFileMetrics(sherpaDir);
  const sourceMetrics = buildSourceMetrics(projectRoot, sherpaDir, conventionsPath, decisionsDir, skillFiles);
  const latestSourceMtimeMs = Math.max(
    conventionsStat?.mtimeMs ?? 0,
    ...decisions.map((decision) => decision.mtimeMs),
    ...skillFiles.map((skill) => skill.mtimeMs),
  );

  return {
    conventions,
    conventionsMtimeMs: conventionsStat?.mtimeMs ?? 0,
    decisions,
    skills: loadSkills(sherpaDir),
    latestSourceMtimeMs,
    sourceMetrics,
  };
}

function buildSourceMetrics(
  projectRoot: string,
  sherpaDir: string,
  conventionsPath: string,
  decisionsDir: string,
  skillFiles: Array<{ name: string; content: string; mtimeMs: number }>,
): SourceMetrics {
  const conventions = metricForFile(projectRoot, conventionsPath);
  const decisionMetrics = aggregateDirectoryMetrics(decisionsDir, (file) => file.endsWith('.md'));
  const skillContent = skillFiles.map((skill) => skill.content).join('\n\n');
  const latestSkillMtime = Math.max(0, ...skillFiles.map((skill) => skill.mtimeMs));
  const latestUpdatedAt = Math.max(
    conventions.updatedAt ? Date.parse(conventions.updatedAt) : 0,
    decisionMetrics.latestMtimeMs,
    latestSkillMtime,
  );

  return {
    conventions,
    decisions: {
      count: decisionMetrics.count,
      sizeBytes: decisionMetrics.sizeBytes,
      lineCount: decisionMetrics.lineCount,
      estimatedTokens: estimateTokens(decisionMetrics.content),
      latestUpdatedAt: toIsoOrNull(decisionMetrics.latestMtimeMs),
      secretsDetected: scanForSecrets(decisionMetrics.content).found,
    },
    skills: {
      count: skillFiles.length,
      names: skillFiles.map((skill) => skill.name).sort(),
      sizeBytes: byteLength(skillContent),
      lineCount: lineCount(skillContent),
      estimatedTokens: estimateTokens(skillContent),
      latestUpdatedAt: toIsoOrNull(latestSkillMtime),
      secretsDetected: scanForSecrets(skillContent).found,
    },
    latestUpdatedAt: toIsoOrNull(latestUpdatedAt),
  };
}

function inspectAgents(
  projectRoot: string,
  sherpaDir: string,
  disabledAdapters: readonly string[],
  requestedAgent: string | undefined,
  workspace: WorkspaceSources,
): AgentInspectMetric[] {
  const registry = createDefaultAdapterRegistry();
  if (requestedAgent && !registry.get(requestedAgent)) {
    throw new Error(`Unknown adapter ${requestedAgent}`);
  }

  const disabled = new Set(disabledAdapters);
  const names = requestedAgent ? [requestedAgent] : registry.names().filter((name) => !disabled.has(name));
  const context = buildAdapterContext(projectRoot, workspace);

  return names.map((name) => {
    const adapter = registry.get(name)!;
    const output = adapter.generate(context);
    const filePath = output.filePath;
    const absolutePath = path.join(projectRoot, filePath);
    const snapshotPath = path.join(sherpaDir, 'adapters', filePath.replace(/\//g, '__'));
    const exists = fs.existsSync(absolutePath);
    const fileContent = exists ? fs.readFileSync(absolutePath, 'utf8') : '';
    const stat = exists ? fs.statSync(absolutePath) : null;
    const snapshotExists = fs.existsSync(snapshotPath);
    const snapshotContent = snapshotExists ? fs.readFileSync(snapshotPath, 'utf8') : '';
    const generatedBySherpa = fileContent.includes(BaseAdapter.GENERATED_MARKER);
    const validation = adapter.validate({
      content: exists ? fileContent : output.content,
      filePath,
      warnings: exists ? [] : output.warnings,
    });
    const secretScan = scanForSecrets(exists ? fileContent : output.content);
    const stale = exists && fileContent !== output.content;
    const sourceNewerThanFile = exists && workspace.latestSourceMtimeMs > (stat?.mtimeMs ?? 0) + 1000;
    const snapshotMatchesFile = snapshotExists && fileContent === snapshotContent;
    const manualEditsDetected =
      exists &&
      generatedBySherpa &&
      stale &&
      !sourceNewerThanFile &&
      !snapshotMatchesFile;

    const warnings = [
      ...output.warnings,
      ...validation.warnings,
      ...validation.errors,
      ...(!exists ? [`${filePath} is missing`] : []),
      ...(exists && !generatedBySherpa ? ['Sherpa generated marker is missing'] : []),
      ...(stale ? ['Current file differs from freshly generated adapter output'] : []),
      ...(sourceNewerThanFile ? ['Agent file is older than the latest Sherpa source'] : []),
      ...(manualEditsDetected ? ['Manual edits detected in generated file'] : []),
      ...(secretScan.found ? [`Potential secrets detected (${uniqueRuleIds(secretScan.matches).join(', ')})`] : []),
    ];

    return {
      agent: name,
      filePath,
      enabled: !disabled.has(name),
      exists,
      status: statusFor({ exists, manualEditsDetected, stale, valid: validation.valid, secretsDetected: secretScan.found }),
      generatedBySherpa,
      stale,
      manualEditsDetected,
      snapshotExists,
      sizeBytes: exists ? byteLength(fileContent) : 0,
      lineCount: exists ? lineCount(fileContent) : 0,
      estimatedTokens: exists ? estimateTokens(fileContent) : 0,
      updatedAt: toIsoOrNull(stat?.mtimeMs ?? 0),
      valid: validation.valid,
      secretsDetected: secretScan.found,
      sourceCoverage: sourceCoverage(fileContent || output.content, workspace),
      warnings: [...new Set(warnings)],
      recommendedAction: recommendedAction({ exists, generatedBySherpa, stale, manualEditsDetected, secretsDetected: secretScan.found }),
    };
  });
}

function buildAdapterContext(projectRoot: string, workspace: WorkspaceSources): AdapterContext {
  const pkgPath = path.join(projectRoot, 'package.json');
  let projectName = path.basename(projectRoot);
  let projectDescription = '';
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { name?: string; description?: string };
      projectName = pkg.name ?? projectName;
      projectDescription = pkg.description ?? '';
    } catch {
      /* ignore malformed package.json */
    }
  }

  return {
    conventions: workspace.conventions,
    preferences: {},
    skills: workspace.skills.map((skill) => ({
      name: skill.name,
      description: skill.description,
      tags: skill.tags,
    })),
    decisions: workspace.decisions.map((decision) => decision.content).filter(Boolean),
    projectName,
    projectDescription,
  };
}

function sourceCoverage(content: string, workspace: WorkspaceSources): AgentInspectMetric['sourceCoverage'] {
  const decisions = workspace.decisions.map((decision) => decision.content).filter(Boolean);
  const skillNames = workspace.skills.map((skill) => skill.name).filter(Boolean);
  return {
    conventionsIncluded: includesMeaningfulSnippet(content, workspace.conventions),
    decisionsIncluded: decisions.filter((decision) => includesMeaningfulSnippet(content, decision)).length,
    decisionsTotal: decisions.length,
    skillsIncluded: skillNames.filter((name) => content.includes(name)).length,
    skillsTotal: skillNames.length,
  };
}

function includesMeaningfulSnippet(haystack: string, needle: string): boolean {
  const normalized = needle.trim();
  if (!normalized) return true;
  return haystack.includes(normalized.length > 160 ? normalized.slice(0, 160) : normalized);
}

function metricForFile(projectRoot: string, absolutePath: string): SourceFileMetric {
  const exists = fs.existsSync(absolutePath);
  const content = exists ? fs.readFileSync(absolutePath, 'utf8') : '';
  const stat = exists ? fs.statSync(absolutePath) : null;
  return {
    path: path.relative(projectRoot, absolutePath),
    exists,
    sizeBytes: byteLength(content),
    lineCount: lineCount(content),
    estimatedTokens: estimateTokens(content),
    updatedAt: toIsoOrNull(stat?.mtimeMs ?? 0),
    secretsDetected: scanForSecrets(content).found,
  };
}

function aggregateDirectoryMetrics(directory: string, include: (file: string) => boolean): {
  count: number;
  content: string;
  sizeBytes: number;
  lineCount: number;
  latestMtimeMs: number;
} {
  if (!fs.existsSync(directory)) {
    return { count: 0, content: '', sizeBytes: 0, lineCount: 0, latestMtimeMs: 0 };
  }

  const files = fs.readdirSync(directory).filter(include).sort();
  const contents: string[] = [];
  let latestMtimeMs = 0;
  for (const file of files) {
    const fullPath = path.join(directory, file);
    const stat = fs.statSync(fullPath);
    latestMtimeMs = Math.max(latestMtimeMs, stat.mtimeMs);
    contents.push(fs.readFileSync(fullPath, 'utf8'));
  }

  const content = contents.join('\n\n');
  return {
    count: files.length,
    content,
    sizeBytes: byteLength(content),
    lineCount: lineCount(content),
    latestMtimeMs,
  };
}

function readSkillFileMetrics(sherpaDir: string): Array<{ name: string; content: string; mtimeMs: number }> {
  const skillsDir = path.join(sherpaDir, 'skills');
  if (!fs.existsSync(skillsDir)) return [];
  const out: Array<{ name: string; content: string; mtimeMs: number }> = [];
  for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillPath = path.join(skillsDir, entry.name, 'SKILL.md');
    if (!fs.existsSync(skillPath)) continue;
    out.push({
      name: entry.name,
      content: fs.readFileSync(skillPath, 'utf8'),
      mtimeMs: fs.statSync(skillPath).mtimeMs,
    });
  }
  return out;
}

function printReport(report: InspectReport, sourcesOnly: boolean): void {
  process.stdout.write('\nSherpa Inspect\n\n');
  process.stdout.write('Sources:\n');
  printSourceFile('conventions.md', report.sources.conventions);
  printSourceAggregate('decisions/', 'files', report.sources.decisions.count, report.sources.decisions);
  printSourceAggregate('skills/', 'skills', report.sources.skills.count, report.sources.skills);
  if (report.sources.skills.names.length > 0) {
    process.stdout.write(`  skill_names: ${report.sources.skills.names.join(', ')}\n`);
  }

  if (sourcesOnly) {
    printSourceSummary(report.sources);
    process.stdout.write('\n');
    return;
  }

  process.stdout.write('\nGenerated Files:\n');
  for (const agent of report.agents) {
    process.stdout.write(`- ${agent.agent}\n`);
    process.stdout.write(`  file: ${agent.filePath}\n`);
    process.stdout.write(`  status: ${agent.status}\n`);
    process.stdout.write(`  size: ${agent.exists ? formatBytes(agent.sizeBytes) : 'n/a'}\n`);
    process.stdout.write(`  lines: ${agent.exists ? agent.lineCount : 'n/a'}\n`);
    process.stdout.write(`  estimated_tokens: ${agent.exists ? agent.estimatedTokens : 'n/a'}\n`);
    process.stdout.write(`  updated: ${formatTimestamp(agent.updatedAt)}\n`);
    process.stdout.write(`  valid: ${yesNo(agent.valid)}\n`);
    process.stdout.write(`  generated_by_sherpa: ${yesNo(agent.generatedBySherpa)}\n`);
    process.stdout.write(`  stale: ${yesNo(agent.stale)}\n`);
    process.stdout.write(`  manual_edits_detected: ${yesNo(agent.manualEditsDetected)}\n`);
    process.stdout.write(`  snapshot_exists: ${yesNo(agent.snapshotExists)}\n`);
    process.stdout.write('  source_coverage:\n');
    process.stdout.write(`    conventions: ${yesNo(agent.sourceCoverage.conventionsIncluded)}\n`);
    process.stdout.write(`    decisions: ${agent.sourceCoverage.decisionsIncluded}/${agent.sourceCoverage.decisionsTotal}\n`);
    process.stdout.write(`    skills: ${agent.sourceCoverage.skillsIncluded}/${agent.sourceCoverage.skillsTotal}\n`);
    process.stdout.write(`  secrets_detected: ${yesNo(agent.secretsDetected)}\n`);
    if (agent.warnings.length > 0) {
      process.stdout.write(`  warnings: ${agent.warnings.join('; ')}\n`);
    }
    if (agent.recommendedAction) {
      process.stdout.write(`  action: ${agent.recommendedAction}\n`);
    }
  }
  printAgentSummary(report.agents);
  process.stdout.write('\n');
}

function printSourceFile(label: string, metric: SourceFileMetric): void {
  process.stdout.write(`- ${label}\n`);
  process.stdout.write(`  status: ${metric.exists ? 'present' : 'missing'}\n`);
  process.stdout.write(`  lines: ${metric.lineCount}\n`);
  process.stdout.write(`  estimated_tokens: ${metric.estimatedTokens}\n`);
  process.stdout.write(`  size: ${formatBytes(metric.sizeBytes)}\n`);
  process.stdout.write(`  updated: ${formatTimestamp(metric.updatedAt)}\n`);
  process.stdout.write(`  secrets_detected: ${yesNo(metric.secretsDetected)}\n`);
}

function printSourceAggregate(
  label: string,
  countLabel: string,
  count: number,
  metric: {
    lineCount: number;
    estimatedTokens: number;
    sizeBytes: number;
    latestUpdatedAt: string | null;
    secretsDetected: boolean;
  },
): void {
  process.stdout.write(`- ${label}\n`);
  process.stdout.write(`  ${countLabel}: ${count}\n`);
  process.stdout.write(`  lines: ${metric.lineCount}\n`);
  process.stdout.write(`  estimated_tokens: ${metric.estimatedTokens}\n`);
  process.stdout.write(`  size: ${formatBytes(metric.sizeBytes)}\n`);
  process.stdout.write(`  updated: ${formatTimestamp(metric.latestUpdatedAt)}\n`);
  process.stdout.write(`  secrets_detected: ${yesNo(metric.secretsDetected)}\n`);
}

function printSourceSummary(sources: SourceMetrics): void {
  process.stdout.write('\nSummary:\n');
  process.stdout.write(`- source tokens: ${totalSourceTokens(sources)}\n`);
  process.stdout.write(`- latest source update: ${formatTimestamp(sources.latestUpdatedAt)}\n`);
  process.stdout.write(
    `- secrets detected: ${yesNo(sources.conventions.secretsDetected || sources.decisions.secretsDetected || sources.skills.secretsDetected)}\n`,
  );
}

function printAgentSummary(agents: AgentInspectMetric[]): void {
  const recommendedActions = [...new Set(agents.map((agent) => agent.recommendedAction).filter(Boolean))];
  process.stdout.write('\nSummary:\n');
  process.stdout.write(`- agents inspected: ${agents.length}\n`);
  process.stdout.write(`- healthy: ${agents.filter((agent) => agent.status === 'healthy').length}\n`);
  process.stdout.write(`- missing: ${agents.filter((agent) => agent.status === 'missing').length}\n`);
  process.stdout.write(`- stale: ${agents.filter((agent) => agent.stale).length}\n`);
  process.stdout.write(`- manual edits: ${agents.filter((agent) => agent.manualEditsDetected).length}\n`);
  process.stdout.write(`- warnings: ${agents.filter((agent) => agent.warnings.length > 0).length}\n`);
  process.stdout.write(`- recommended action: ${recommendedActions.length ? recommendedActions.join(' && ') : 'none'}\n`);
}

function yesNo(value: boolean): 'yes' | 'no' {
  return value ? 'yes' : 'no';
}

function formatTimestamp(value: string | null): string {
  return value ?? 'n/a';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function statusFor(input: {
  exists: boolean;
  manualEditsDetected: boolean;
  stale: boolean;
  valid: boolean;
  secretsDetected: boolean;
}): AgentInspectMetric['status'] {
  if (!input.exists) return 'missing';
  if (input.manualEditsDetected) return 'manual_edit';
  if (input.stale) return 'stale';
  if (!input.valid || input.secretsDetected) return 'warning';
  return 'healthy';
}

function recommendedAction(input: {
  exists: boolean;
  generatedBySherpa: boolean;
  stale: boolean;
  manualEditsDetected: boolean;
  secretsDetected: boolean;
}): string | null {
  if (input.secretsDetected) return 'remove secret-like content before adapting';
  if (!input.exists) return 'sherpa adapt';
  if (input.manualEditsDetected || !input.generatedBySherpa) return 'sherpa pull && sherpa adapt';
  if (input.stale) return 'sherpa adapt';
  return null;
}

function totalSourceTokens(sources: SourceMetrics): number {
  return sources.conventions.estimatedTokens + sources.decisions.estimatedTokens + sources.skills.estimatedTokens;
}

function estimateTokens(content: string): number {
  if (!content.trim()) return 0;
  return Math.ceil(content.length / 4);
}

function lineCount(content: string): number {
  if (!content) return 0;
  return content.split(/\r?\n/).length;
}

function byteLength(content: string): number {
  return Buffer.byteLength(content, 'utf8');
}

function statOrNull(filePath: string): fs.Stats | null {
  try {
    return fs.statSync(filePath);
  } catch {
    return null;
  }
}

function toIsoOrNull(ms: number): string | null {
  return ms > 0 ? new Date(ms).toISOString() : null;
}

function uniqueRuleIds(matches: Array<{ ruleId: string }>): string[] {
  return [...new Set(matches.map((match) => match.ruleId))];
}
