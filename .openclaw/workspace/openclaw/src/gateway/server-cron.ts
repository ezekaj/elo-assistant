import type { CliDeps } from "../cli/deps.js";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { resolveDefaultAgentId } from "../agents/agent-scope.js";
import { loadConfig } from "../config/config.js";
import { resolveAgentMainSessionKey } from "../config/sessions.js";
import { runCronIsolatedAgentTurn } from "../cron/isolated-agent.js";
import { appendCronRunLog, resolveCronRunLogPath } from "../cron/run-log.js";
import { CronService } from "../cron/service.js";
import { resolveCronStorePath } from "../cron/store.js";
import { runHeartbeatOnce } from "../infra/heartbeat-runner.js";
import { requestHeartbeatNow } from "../infra/heartbeat-wake.js";
import { enqueueSystemEvent } from "../infra/system-events.js";
import { getChildLogger } from "../logging.js";
import { normalizeAgentId } from "../routing/session-key.js";
import { defaultRuntime } from "../runtime.js";
import {
  initPredictiveService,
  type PredictiveServiceConfig,
} from "../agents/predictive-service.js";
import { mergePredictiveConfig } from "../config/types.predictive.js";
import {
  initEvolutionService,
  type EvolutionServiceConfig,
} from "../services/evolution/instance.js";

export type GatewayCronState = {
  cron: CronService;
  storePath: string;
  cronEnabled: boolean;
};

export function buildGatewayCronService(params: {
  cfg: ReturnType<typeof loadConfig>;
  deps: CliDeps;
  broadcast: (event: string, payload: unknown, opts?: { dropIfSlow?: boolean }) => void;
}): GatewayCronState {
  const cronLogger = getChildLogger({ module: "cron" });
  const storePath = resolveCronStorePath(params.cfg.cron?.store);
  const cronEnabled = process.env.OPENCLAW_SKIP_CRON !== "1" && params.cfg.cron?.enabled !== false;

  const resolveCronAgent = (requested?: string | null) => {
    const runtimeConfig = loadConfig();
    const normalized =
      typeof requested === "string" && requested.trim() ? normalizeAgentId(requested) : undefined;
    const hasAgent =
      normalized !== undefined &&
      Array.isArray(runtimeConfig.agents?.list) &&
      runtimeConfig.agents.list.some(
        (entry) =>
          entry && typeof entry.id === "string" && normalizeAgentId(entry.id) === normalized,
      );
    const agentId = hasAgent ? normalized : resolveDefaultAgentId(runtimeConfig);
    return { agentId, cfg: runtimeConfig };
  };

  const cron = new CronService({
    storePath,
    cronEnabled,
    enqueueSystemEvent: (text, opts) => {
      const { agentId, cfg: runtimeConfig } = resolveCronAgent(opts?.agentId);
      const sessionKey = resolveAgentMainSessionKey({
        cfg: runtimeConfig,
        agentId,
      });
      enqueueSystemEvent(text, { sessionKey });
    },
    requestHeartbeatNow,
    runHeartbeatOnce: async (opts) => {
      const runtimeConfig = loadConfig();
      return await runHeartbeatOnce({
        cfg: runtimeConfig,
        reason: opts?.reason,
        deps: { ...params.deps, runtime: defaultRuntime },
      });
    },
    runIsolatedAgentJob: async ({ job, message }) => {
      const { agentId, cfg: runtimeConfig } = resolveCronAgent(job.agentId);
      return await runCronIsolatedAgentTurn({
        cfg: runtimeConfig,
        deps: params.deps,
        job,
        message,
        agentId,
        sessionKey: `cron:${job.id}`,
        lane: "cron",
      });
    },
    log: getChildLogger({ module: "cron", storePath }),
    onEvent: (evt) => {
      params.broadcast("cron", evt, { dropIfSlow: true });
      if (evt.action === "finished") {
        const logPath = resolveCronRunLogPath({
          storePath,
          jobId: evt.jobId,
        });
        void appendCronRunLog(logPath, {
          ts: Date.now(),
          jobId: evt.jobId,
          action: "finished",
          status: evt.status,
          error: evt.error,
          summary: evt.summary,
          runAtMs: evt.runAtMs,
          durationMs: evt.durationMs,
          nextRunAtMs: evt.nextRunAtMs,
        }).catch((err) => {
          cronLogger.warn({ err: String(err), logPath }, "cron: run log append failed");
        });
      }
    },
  });

  // Initialize predictive service
  const predictiveConfig = mergePredictiveConfig(params.cfg.predictive);

  if (predictiveConfig.enabled) {
    const predictiveServiceConfig: PredictiveServiceConfig = {
      enabled: predictiveConfig.enabled,
      agentId: resolveDefaultAgentId(params.cfg),
      db: null, // Predictive engine manages its own DB
      neuroMemory: predictiveConfig.neuroMemory,
      autoDeliver: {
        enabled: predictiveConfig.autoDeliver?.enabled ?? true,
        maxPerDay: predictiveConfig.autoDeliver?.maxPerDay ?? 3,
        channels: predictiveConfig.autoDeliver?.channels ?? ["signal", "webchat"],
        quietHours: predictiveConfig.autoDeliver?.quietHours ?? { start: 22, end: 8 },
        minConfidence: predictiveConfig.autoDeliver?.minConfidence ?? 0.8,
      },
      schedule: {
        checkIntervalMs: predictiveConfig.schedule?.checkIntervalMs ?? 1800000,
        patternLearningEnabled: predictiveConfig.schedule?.patternLearningEnabled ?? true,
        consolidationIntervalMs: predictiveConfig.schedule?.consolidationIntervalMs ?? 3600000,
      },
      categories: {
        calendar: predictiveConfig.categories?.calendar ?? true,
        email: predictiveConfig.categories?.email ?? true,
        task: predictiveConfig.categories?.task ?? true,
        workflow: predictiveConfig.categories?.workflow ?? true,
        communication: predictiveConfig.categories?.communication ?? false,
        context: predictiveConfig.categories?.context ?? true,
      },
    };

    try {
      const predictiveService = initPredictiveService(predictiveServiceConfig);
      predictiveService.start().catch((err) => {
        cronLogger.warn("Failed to start predictive service:", err);
      });
      cronLogger.info("✅ Predictive service initialized");

      // Add default predictive cron jobs
      if (cronEnabled) {
        // Morning prediction briefing (8am weekdays)
        const morningJob = {
          id: "predictive-morning-briefing",
          name: "Morning Prediction Briefing",
          schedule: {
            kind: "cron" as const,
            expr: "0 8 * * 1-5",
            tz: "Europe/Berlin",
          },
          payload: {
            kind: "systemEvent" as const,
            text: "PREDICTION_MORNING_BRIEFING",
          },
          sessionTarget: "main" as const,
          enabled: true,
        };

        // Periodic prediction checks (every 30 minutes)
        const periodicJob = {
          id: "predictive-periodic-check",
          name: "Periodic Prediction Check",
          schedule: {
            kind: "every" as const,
            everyMs: 1800000, // 30 minutes
          },
          payload: {
            kind: "systemEvent" as const,
            text: "PREDICTION_CHECK",
          },
          sessionTarget: "main" as const,
          enabled: true,
        };

        // Pattern consolidation (every hour)
        const consolidationJob = {
          id: "predictive-consolidation",
          name: "Pattern Consolidation",
          schedule: {
            kind: "every" as const,
            everyMs: 3600000, // 1 hour
          },
          payload: {
            kind: "systemEvent" as const,
            text: "PREDICTION_CONSOLIDATION",
          },
          sessionTarget: "main" as const,
          enabled: true,
        };

        try {
          cron.addJob(morningJob);
          cron.addJob(periodicJob);
          cron.addJob(consolidationJob);
          cronLogger.info("✅ Default predictive cron jobs added");
        } catch (err) {
          // Jobs may already exist
          cronLogger.debug("Predictive jobs may already exist:", err);
        }
      }
    } catch (err) {
      cronLogger.warn("Failed to initialize predictive service:", err);
    }
  }

  // Initialize evolution service
  try {
    // Resolve openclaw directory (workspace/openclaw)
    const openclawDir = params.cfg?.stateDir
      ? path.resolve(params.cfg.stateDir, 'workspace', 'openclaw')
      : path.resolve(process.cwd());
    const selfEvolvingDir = path.resolve(openclawDir, '..', 'openclaw-self-evolving');

    // Verify self-evolving repo exists
    try {
      fs.accessSync(path.join(selfEvolvingDir, 'scripts', 'analyze-behavior.sh'));
    } catch {
      cronLogger.warn(`Evolution service disabled: openclaw-self-evolving not found at ${selfEvolvingDir}`);
      throw new Error('openclaw-self-evolving repo not found');
    }

    const evolutionService = initEvolutionService({
      openclawDir,
      selfEvolvingDir,
      config: {
        enabled: true,
        autoApply: false,  // Require manual approval
        requireTests: true,
        minAccuracy: 0.95
      }
    });

    cronLogger.info("✅ Evolution service initialized");

    // Add weekly evolution cron job (Sunday 2am)
    if (cronEnabled) {
      const evolutionJob = {
        id: "evolution-weekly",
        name: "Weekly Code Evolution",
        schedule: {
          kind: "cron" as const,
          expr: "0 2 * * 0",
          tz: "Europe/Berlin",
        },
        payload: {
          kind: "systemEvent" as const,
          text: "WEEKLY_EVOLUTION_CHECK",
        },
        sessionTarget: "main" as const,
        enabled: true,
      };

      cron.addJob(evolutionJob);
      cronLogger.info("📅 Scheduled weekly evolution check (Sunday 2am)");
    }
  } catch (err) {
    cronLogger.warn("Failed to initialize evolution service:", err);
  }

  return { cron, storePath, cronEnabled };
}
