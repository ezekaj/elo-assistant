/**
 * Plugin Installation from Git Repository
 *
 * Provides git-based plugin installation.
 * Matches Claude Code's git install functionality.
 */

import { execa } from "execa";
import type { PluginInstallResult } from "./install.js";
import { installPluginFromPackageDir } from "./install.js";

/**
 * Git installation options
 */
export interface GitInstallOptions {
  /** Git repository URL */
  repo: string;
  /** Branch, tag, or SHA to install (optional, defaults to main/master) */
  ref?: string;
  /** Subdirectory within repo (optional) */
  subdir?: string;
}

/**
 * Install plugin from git repository
 *
 * @param options - Git installation options
 * @returns Installation result
 */
export async function installPluginFromGit(
  options: GitInstallOptions,
): Promise<PluginInstallResult> {
  const tempDir = `/tmp/openclaw-plugin-${Date.now()}`;

  try {
    // Clone repository
    const cloneArgs = ["clone", options.repo, tempDir];
    if (options.ref) {
      cloneArgs.push("--branch", options.ref, "--depth", "1");
    }

    console.log(`[GitInstall] Cloning ${options.repo} to ${tempDir}`);
    await execa("git", cloneArgs);

    // Handle subdirectory
    const pluginDir = options.subdir ? `${tempDir}/${options.subdir}` : tempDir;

    // Install from directory
    console.log(`[GitInstall] Installing from ${pluginDir}`);
    const result = await installPluginFromPackageDir({
      packageDir: pluginDir,
    });

    // Cleanup temp directory
    console.log("[GitInstall] Cleaning up temp directory");
    await execa("rm", ["-rf", tempDir]);

    return result;
  } catch (error) {
    // Cleanup on error
    try {
      await execa("rm", ["-rf", tempDir]);
    } catch {
      // Ignore cleanup errors
    }

    return {
      ok: false,
      error: error instanceof Error ? error.message : "Git install failed",
    };
  }
}

/**
 * Parse git URL into repo and ref
 */
export function parseGitUrl(url: string): { repo: string; ref?: string } {
  // Handle GitHub shorthand: github:user/repo or user/repo
  if (url.startsWith("github:")) {
    url = `https://github.com/${url.slice(7)}.git`;
  } else if (!url.startsWith("http") && !url.startsWith("git@") && url.includes("/")) {
    url = `https://github.com/${url}.git`;
  }

  // Handle ref in URL (#branch or #tag)
  const hashIndex = url.lastIndexOf("#");
  if (hashIndex !== -1) {
    const ref = url.slice(hashIndex + 1);
    const repo = url.slice(0, hashIndex);
    return { repo, ref: ref || undefined };
  }

  return { repo: url };
}

/**
 * Install plugin from GitHub shorthand
 *
 * @param shorthand - GitHub shorthand (e.g., "user/repo" or "github:user/repo")
 * @param ref - Optional branch/tag/SHA
 * @returns Installation result
 */
export async function installPluginFromGitHub(
  shorthand: string,
  ref?: string,
): Promise<PluginInstallResult> {
  const { repo } = parseGitUrl(shorthand);
  return installPluginFromGit({ repo, ref });
}
