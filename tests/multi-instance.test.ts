import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import test from "node:test";

import { createDisposablePiHome, snapshotTree, startInstance, withStartedInstances, type InstanceHandle } from "./fixtures/model-profile-instance.ts";

// Each instance is a separate Node process that loads the real extension default export
// against fake Pi APIs. Live model/thinking and reload counts are fake in-memory state;
// files are real disposable files. Nothing here proves how installed Gentle routes children.

async function withInstances(roots: { a: string; b: string }, run: (a: InstanceHandle, b: InstanceHandle) => Promise<void>, start = startInstance): Promise<void> {
  await withStartedInstances(roots, run, start);
}

// Scripted pipes exercise lifecycle faults without subprocess startup timing races.
function scriptedChild(mode: string) {
  const child = new EventEmitter() as any;
  child.pid = 12345;
  child.exitCode = null;
  child.signalCode = null;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.signals = [] as string[];
  const exit = () => {
    child.exitCode = 0;
    child.emit("exit", 0, null);
    child.stdout.end();
    child.stderr.end();
    child.emit("close", 0, null);
  };
  child.stdin = new Writable({
    write(chunk, _encoding, done) {
      const message = JSON.parse(String(chunk));
      if (mode === "early-exit") exit();
      else if (mode !== "spawn-error" && mode !== "hung-ready" && (message.op === "ready" || mode !== "hung-request")) {
        child.stdout.write(`${JSON.stringify({ pid: child.pid })}\n`);
      }
      done();
    },
    final(done) { if (mode !== "hung-close") exit(); done(); },
  });
  child.kill = (signal: string) => {
    child.signals.push(signal);
    if (signal === "SIGKILL") exit();
    return true;
  };
  return child;
}

for (const mode of ["spawn-error", "early-exit", "hung-ready", "hung-request", "hung-close"]) {
  test(`lifecycle: ${mode} is bounded and reaped`, { timeout: 2000 }, async () => {
    const child = scriptedChild(mode);
    const options = {
      spawn: () => {
        if (mode === "spawn-error") queueMicrotask(() => child.emit("error", new Error("injected spawn failure")));
        return child;
      },
      timeoutMs: 20,
    };
    let handle: InstanceHandle | undefined;
    try {
      if (["spawn-error", "early-exit", "hung-ready"].includes(mode)) {
        await assert.rejects(startInstance("fault", "/unused", options).then((value) => { handle = value; return value; }), /spawn failure|exited|ready.*timed out/);
      } else {
        handle = await startInstance("fault", "/unused", options);
        if (mode === "hung-request") await assert.rejects(handle.state(), /state.*timed out/);
        await Promise.all([handle.close(), handle.close()]);
        await assert.rejects(handle.state(), /closed|exited|timed out/);
      }
      if (mode !== "spawn-error") assert.notEqual(child.exitCode, null);
      if (mode === "hung-close") assert.deepEqual(child.signals, ["SIGTERM", "SIGKILL"]);
    } finally {
      await handle?.close();
    }
  });
}

test("lifecycle: B startup failure closes A before propagating", async () => {
  let closed = 0;
  const start = async (name: string) => {
    if (name === "B") throw new Error("B startup failed");
    return { close: async () => { closed += 1; } } as InstanceHandle;
  };
  await assert.rejects(withInstances({ a: "/unused", b: "/unused" }, async () => assert.fail("must not run"), start), /B startup failed/);
  assert.equal(closed, 1);
});

test("lifecycle: disposable home cleanup is owned and idempotent", async () => {
  const home = await createDisposablePiHome();
  const other = await createDisposablePiHome();
  try {
    const before = await snapshotTree(other.root);
    await home.close();
    await home.close();
    await assert.rejects(access(home.root), { code: "ENOENT" });
    assert.deepEqual(await snapshotTree(other.root), before);
  } finally {
    await Promise.all([home.close(), other.close()]);
  }
});

test("lifecycle: synchronous spawn failure propagates without a handle", async () => {
  await assert.rejects(startInstance("fault", "/unused", {
    spawn: () => { throw new Error("synchronous spawn failure"); },
  }), /synchronous spawn failure/);
});

test("lifecycle: real missing executable rejects on spawn error", async () => {
  await assert.rejects(startInstance("missing", "/unused", {
    spawn: (_command, args, options) => spawn("/nonexistent-odd-fixture-executable", args, options),
  }), /ENOENT/);
});

test("lifecycle: unreapable child reports bounded shutdown failure", { timeout: 2000 }, async () => {
  const child = scriptedChild("hung-close");
  child.kill = (signal: string) => { child.signals.push(signal); return false; };
  const instance = await startInstance("stuck", "/unused", { spawn: () => child, timeoutMs: 20 });
  await assert.rejects(instance.close(), /shutdown timed out after SIGKILL/);
  await assert.rejects(instance.close(), /shutdown timed out after SIGKILL/);
  assert.deepEqual(child.signals, ["SIGTERM", "SIGKILL"]);
  child.stdin.destroy();
  child.stdout.destroy();
  child.stderr.destroy();
});

test("lifecycle: callback failure closes both successful starts", async () => {
  const closed: string[] = [];
  const start = async (name: string) => ({ close: async () => { closed.push(name); } }) as InstanceHandle;
  await assert.rejects(withInstances({ a: "/unused", b: "/unused" }, async () => {
    throw new Error("scenario failure");
  }, start), /scenario failure/);
  assert.deepEqual(closed.sort(), ["A", "B"]);
});

const initialSession = { model: { provider: "openai-codex", id: "orchestrator" }, thinking: "high" };

test("shared root: A switch changes shared files and only A's live model and reload", async (t) => {
  const home = await createDisposablePiHome();
  t.after(() => home.close());
  await withInstances({ a: home.root, b: home.root }, async (a, b) => {
    assert.notEqual(a.pid, b.pid);
    assert.deepEqual((await a.state()).session, initialSession);
    assert.deepEqual((await b.state()).session, initialSession);

    const switched = await a.run("local");
    assert.equal(switched.notifications.at(-1)?.level, "info");
    assert.match(switched.notifications.at(-1)?.message ?? "", /Only the invoking session reloads/);
    assert.equal(switched.reloadCount, 1);
    assert.deepEqual(switched.session, { model: { provider: "local", id: "orchestrator" }, thinking: "medium" });
    assert.deepEqual(JSON.parse(await readFile(home.canonicalPath, "utf8")).orchestrator, { model: "local/orchestrator", thinking: "medium" });
    assert.deepEqual(JSON.parse(await readFile(home.runtimePath, "utf8")).model_profiles["gentle-ai-explore"], { model: "local/gentle-ai-explore", effort: "medium" });

    // No broadcast: B's live state, reload count, and Pi API calls are untouched by A.
    const bAfterA = await b.state();
    assert.deepEqual(bAfterA.session, initialSession);
    assert.equal(bAfterA.reloadCount, 0);
    assert.deepEqual(bAfterA.modelCalls, []);
    assert.deepEqual(bAfterA.thinkingCalls, []);

    // B status reads the shared files A wrote, reports its own live model, and writes nothing.
    const beforeStatus = await snapshotTree(home.root);
    const status = await b.run("status");
    const text = status.notifications.at(-1)?.message ?? "";
    assert.match(text, /Persisted ODD profile: local/);
    assert.match(text, /Invoking live orchestrator: openai-codex\/orchestrator \(high\)/);
    assert.match(text, /Live vs canonical: mismatch; live vs runtime: mismatch/);
    assert.match(text, /Other sessions are not observed/);
    assert.deepEqual(status.session, initialSession);
    assert.equal(status.reloadCount, 0);
    assert.deepEqual(await snapshotTree(home.root), beforeStatus);

    // B's own selection of the already-saved profile aligns B live; files are a no-op so no reload.
    const aligned = await b.run("local");
    assert.match(aligned.notifications.at(-1)?.message ?? "", /shared files unchanged; invoking live orchestrator aligned; no reload needed/);
    assert.deepEqual(aligned.session, { model: { provider: "local", id: "orchestrator" }, thinking: "medium" });
    assert.equal(aligned.reloadCount, 0);
    assert.deepEqual(await snapshotTree(home.root), beforeStatus);

    // B's own changing switch reloads only B; A keeps its live model and reload count.
    const bSwitched = await b.run("grok");
    assert.equal(bSwitched.reloadCount, 1);
    assert.deepEqual(bSwitched.session, { model: { provider: "xai", id: "orchestrator" }, thinking: "xhigh" });
    const aAfterB = await a.state();
    assert.deepEqual(aAfterB.session, { model: { provider: "local", id: "orchestrator" }, thinking: "medium" });
    assert.equal(aAfterB.reloadCount, 1);
    assert.deepEqual(aAfterB.modelCalls, ["local/orchestrator"]);
    const aStatus = await a.run("status");
    assert.match(aStatus.notifications.at(-1)?.message ?? "", /Persisted ODD profile: grok/);
    assert.match(aStatus.notifications.at(-1)?.message ?? "", /Invoking live orchestrator: local\/orchestrator \(medium\)/);
  });
});

test("shared root: undo by A reverts shared files for B to observe without touching B live state", async (t) => {
  const home = await createDisposablePiHome();
  t.after(() => home.close());
  await withInstances({ a: home.root, b: home.root }, async (a, b) => {
    await a.run("grok");
    const undone = await a.run("undo");
    assert.match(undone.notifications.at(-1)?.message ?? "", /undone in shared persisted configuration/);
    assert.equal(undone.reloadCount, 2);
    // Undo restores files only; A's live model stays on the switched profile.
    assert.deepEqual(undone.session, { model: { provider: "xai", id: "orchestrator" }, thinking: "xhigh" });

    const status = await b.run("status");
    assert.match(status.notifications.at(-1)?.message ?? "", /Persisted ODD profile: openai/);
    assert.match(status.notifications.at(-1)?.message ?? "", /Live vs canonical: match; live vs runtime: match/);
    assert.deepEqual(status.session, initialSession);
    assert.equal(status.reloadCount, 0);
  });
});

test("shared root: A reload failure keeps shared files applied and leaves B untouched", async (t) => {
  const home = await createDisposablePiHome();
  t.after(() => home.close());
  await withInstances({ a: home.root, b: home.root }, async (a, b) => {
    await a.failReloads("reload unavailable");
    const switched = await a.run("local");
    assert.equal(switched.reloadCount, 1);
    assert.equal(switched.notifications.at(-1)?.level, "error");
    assert.match(switched.notifications.at(-1)?.message ?? "", /reload unavailable.*shared persisted state remains applied/s);
    assert.deepEqual(JSON.parse(await readFile(home.runtimePath, "utf8")).model_profiles.orchestrator, { model: "local/orchestrator", effort: "medium" });

    const bState = await b.state();
    assert.deepEqual(bState.session, initialSession);
    assert.equal(bState.reloadCount, 0);
    assert.deepEqual(bState.notifications, []);
  });
});

test("separate roots: A switch leaves B's root byte-identical (file isolation only)", async (t) => {
  const homeA = await createDisposablePiHome();
  t.after(() => homeA.close());
  const homeB = await createDisposablePiHome();
  t.after(() => homeB.close());
  await withInstances({ a: homeA.root, b: homeB.root }, async (a, b) => {
    const beforeB = await snapshotTree(homeB.root);
    const switched = await a.run("local");
    assert.equal(switched.reloadCount, 1);
    assert.deepEqual(JSON.parse(await readFile(homeA.canonicalPath, "utf8")).orchestrator, { model: "local/orchestrator", thinking: "medium" });
    assert.deepEqual(await snapshotTree(homeB.root), beforeB);

    const status = await b.run("status");
    assert.match(status.notifications.at(-1)?.message ?? "", /Persisted ODD profile: openai/);
    assert.ok((status.notifications.at(-1)?.message ?? "").includes(`Canonical source: ${homeB.canonicalPath}`));
    assert.deepEqual(status.session, initialSession);
    assert.equal(status.reloadCount, 0);
  });
});
