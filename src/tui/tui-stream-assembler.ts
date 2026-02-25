import {
  composeThinkingAndContent,
  extractContentFromMessage,
  extractThinkingFromMessage,
  resolveFinalAssistantText,
} from "./tui-formatters.js";

type RunStreamState = {
  thinkingText: string;
  contentText: string;
  displayText: string;
};

/**
 * TuiStreamAssembler - Manages streaming text assembly.
 *
 * Note: The stream sends full accumulated text on each delta, not partial deltas.
 * We use simple string storage since we're replacing, not appending.
 * The Piece Table optimization is more useful for incremental editing scenarios.
 */
export class TuiStreamAssembler {
  private runs = new Map<string, RunStreamState>();

  private getOrCreateRun(runId: string): RunStreamState {
    let state = this.runs.get(runId);
    if (!state) {
      state = {
        thinkingText: "",
        contentText: "",
        displayText: "",
      };
      this.runs.set(runId, state);
    }
    return state;
  }

  private updateRunState(state: RunStreamState, message: unknown, showThinking: boolean) {
    const thinkingText = extractThinkingFromMessage(message);
    const contentText = extractContentFromMessage(message);

    if (thinkingText) {
      state.thinkingText = thinkingText;
    }
    if (contentText) {
      state.contentText = contentText;
    }

    const displayText = composeThinkingAndContent({
      thinkingText: state.thinkingText,
      contentText: state.contentText,
      showThinking,
    });

    state.displayText = displayText;
  }

  /**
   * Ingest a streaming delta and return the updated display text.
   * Returns null if there's no change to display.
   */
  ingestDelta(runId: string, message: unknown, showThinking: boolean): string | null {
    const state = this.getOrCreateRun(runId);
    const previousDisplayText = state.displayText;
    this.updateRunState(state, message, showThinking);

    if (!state.displayText || state.displayText === previousDisplayText) {
      return null;
    }

    return state.displayText;
  }

  /**
   * Finalize a stream and return the complete text.
   */
  finalize(runId: string, message: unknown, showThinking: boolean): string {
    const state = this.getOrCreateRun(runId);
    this.updateRunState(state, message, showThinking);
    const finalComposed = state.displayText;

    const finalText = resolveFinalAssistantText({
      finalText: finalComposed,
      streamedText: state.displayText,
    });

    this.runs.delete(runId);
    return finalText;
  }

  /**
   * Drop a run without finalizing (e.g., on abort).
   */
  drop(runId: string) {
    this.runs.delete(runId);
  }

  /**
   * Get stats for debugging/monitoring.
   */
  getStats(): { activeRuns: number } {
    return {
      activeRuns: this.runs.size,
    };
  }
}
