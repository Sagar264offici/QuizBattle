import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The API tests share the same Redis instance and each resets it in
    // beforeEach — running files in parallel would wipe each other's state.
    fileParallelism: false,
    // Each API test issues many sequential Upstash REST calls (~5-15ms each),
    // so give the suite generous timeouts instead of the 5s default.
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
