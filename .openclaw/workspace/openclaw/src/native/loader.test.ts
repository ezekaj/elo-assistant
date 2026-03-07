/**
 * Native Module System Tests
 *
 * Tests for the native module loader and fallback system.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getPlatform,
  getNativeExtension,
  loadNativeModuleWithFallback,
  registry,
  getRegistryStats,
} from "../loader.js";

describe("Native Module Loader", () => {
  describe("getPlatform", () => {
    it("should return current platform info", () => {
      const platform = getPlatform();
      expect(platform).toHaveProperty("os");
      expect(platform).toHaveProperty("arch");
      expect(["darwin", "linux", "win32"]).toContain(platform.os);
      expect(["x64", "arm64", "x32"]).toContain(platform.arch);
    });
  });

  describe("getNativeExtension", () => {
    it("should return .node for all platforms", () => {
      const ext = getNativeExtension();
      expect(ext).toBe(".node");
    });
  });

  describe("registry", () => {
    beforeEach(() => {
      // Clear registry before each test
      // Note: In a real implementation, we'd have a clear method
    });

    it("should track loaded modules", () => {
      const stats = getRegistryStats();
      expect(stats).toHaveProperty("total");
      expect(stats).toHaveProperty("native");
      expect(stats).toHaveProperty("fallback");
    });

    it("should report correct stats", () => {
      const stats = getRegistryStats();
      expect(stats.total).toBeGreaterThanOrEqual(0);
      expect(stats.native).toBeGreaterThanOrEqual(0);
      expect(stats.fallback).toBeGreaterThanOrEqual(0);
      expect(stats.native + stats.fallback).toBe(stats.total);
    });
  });

  describe("loadNativeModuleWithFallback", () => {
    it("should load fallback when native is not available", async () => {
      const result = await loadNativeModuleWithFallback({
        name: "test-module",
        fallbackFactory: async () => ({
          test: () => "fallback",
        }),
        preferNative: false,
      });

      expect(result.module).toBeTruthy();
      expect(result.isNative).toBe(false);
      expect(result.module?.implementation).toHaveProperty("test");
    });

    it("should handle load errors gracefully", async () => {
      const result = await loadNativeModuleWithFallback({
        name: "error-module",
        nativePath: "/nonexistent/path/module.node",
        fallbackFactory: async () => ({
          test: () => "fallback",
        }),
        loadTimeout: 100,
      });

      expect(result.module).toBeTruthy();
      expect(result.isNative).toBe(false);
    });

    it("should prefer native when available and preferNative is true", async () => {
      let nativeCalled = false;

      const result = await loadNativeModuleWithFallback({
        name: "prefer-native",
        nativeFactory: async () => {
          nativeCalled = true;
          return {
            test: () => "native",
          };
        },
        fallbackFactory: async () => ({
          test: () => "fallback",
        }),
        preferNative: true,
      });

      expect(nativeCalled).toBe(true);
      expect(result.isNative).toBe(true);
    });
  });
});
