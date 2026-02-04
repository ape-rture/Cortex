import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchGranolaTranscript, isGranolaUrl } from "./granola.js";

test("isGranolaUrl detects granola links", () => {
  assert.equal(isGranolaUrl("https://app.granola.ai/share/abc"), true);
  assert.equal(isGranolaUrl("https://example.com"), false);
  assert.equal(isGranolaUrl("not-a-url"), false);
});

test("fetchGranolaTranscript extracts text and title", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      "<html><head><title>Granola Meeting</title></head><body><main><h1>Call</h1><p>We discussed launch timeline.</p></main></body></html>",
      { status: 200 },
    )) as typeof fetch;

  try {
    const result = await fetchGranolaTranscript("https://app.granola.ai/share/meeting-1");
    assert.equal(result.title, "Granola Meeting");
    assert.ok(result.text.includes("We discussed launch timeline."));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchGranolaTranscript throws on HTTP failure", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("not found", { status: 404, statusText: "Not Found" })) as typeof fetch;

  try {
    await assert.rejects(
      () => fetchGranolaTranscript("https://app.granola.ai/share/missing"),
      /Failed to fetch Granola URL/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchGranolaTranscript throws when no text content extracted", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response("<html><body><script>ignore</script><style>ignore</style></body></html>", { status: 200 })) as typeof fetch;

  try {
    await assert.rejects(
      () => fetchGranolaTranscript("https://app.granola.ai/share/empty"),
      /No text content extracted/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
