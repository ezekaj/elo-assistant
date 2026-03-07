/**
 * Git Integration for Session Teleport
 *
 * Provides git operations needed for session teleport.
 * Validates working directory, manages branches, handles stashing.
 */

import { execa } from "execa";

/**
 * Check if git working directory is clean
 */
export async function isGitClean(options: { ignoreUntracked?: boolean } = {}): Promise<boolean> {
  try {
    const args = ["status", "--porcelain"];
    if (options.ignoreUntracked) {
      args.push("--untracked-files=no");
    }
    const { stdout } = await execa("git", args);
    return stdout.trim() === "";
  } catch {
    return false;
  }
}

/**
 * Validate git working directory is clean for teleport
 * Throws error if directory is not clean
 */
export async function validateGitWorkingDirectory(): Promise<void> {
  const clean = await isGitClean({ ignoreUntracked: true });
  if (!clean) {
    throw new Error(
      "Git working directory is not clean. Please commit or stash your changes before teleporting.",
    );
  }
}

/**
 * Fetch branch from remote
 */
export async function fetchBranch(branch: string): Promise<void> {
  try {
    await execa("git", ["fetch", "origin", branch]);
  } catch (error) {
    // Try fetching ref if branch fetch fails
    try {
      await execa("git", ["fetch", "origin", branch]);
    } catch {
      throw new Error(`Failed to fetch branch '${branch}' from remote`);
    }
  }
}

/**
 * Checkout branch
 */
export async function checkoutBranch(branch: string): Promise<void> {
  const { code, stderr } = await execa("git", ["checkout", branch]);
  if (code !== 0) {
    throw new Error(`Failed to checkout branch '${branch}': ${stderr}`);
  }
}

/**
 * Get current branch name
 */
export async function getCurrentBranch(): Promise<string> {
  const { stdout } = await execa("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
  return stdout.trim();
}

/**
 * Check if branch exists locally
 */
export async function branchExists(branch: string): Promise<boolean> {
  try {
    const { code } = await execa("git", ["rev-parse", "--verify", branch]);
    return code === 0;
  } catch {
    return false;
  }
}

/**
 * Check if branch exists on remote
 */
export async function remoteBranchExists(branch: string): Promise<boolean> {
  try {
    const { code } = await execa("git", ["rev-parse", "--verify", `origin/${branch}`]);
    return code === 0;
  } catch {
    return false;
  }
}

/**
 * Stash uncommitted changes
 */
export async function stashChanges(message?: string): Promise<void> {
  const args = ["stash", "push"];
  if (message) {
    args.push("-m", message);
  }
  await execa("git", args);
}

/**
 * Pop most recent stash
 */
export async function popStash(): Promise<void> {
  await execa("git", ["stash", "pop"]);
}

/**
 * List stashes
 */
export async function listStashes(): Promise<string[]> {
  try {
    const { stdout } = await execa("git", ["stash", "list"]);
    return stdout.split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Check if git repository exists in current directory
 */
export async function isGitRepository(): Promise<boolean> {
  try {
    const { code } = await execa("git", ["rev-parse", "--git-dir"]);
    return code === 0;
  } catch {
    return false;
  }
}

/**
 * Get git repository root
 */
export async function getGitRoot(): Promise<string> {
  const { stdout } = await execa("git", ["rev-parse", "--show-toplevel"]);
  return stdout.trim();
}
