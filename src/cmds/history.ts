import * as vscode from "vscode";
import { getHistory, getSession, setSession } from "@core/history";

async function copy(text: string, msg: string) {
  await vscode.env.clipboard.writeText(text);
  vscode.window.showInformationMessage(msg);
}

export async function copyLast() {
  const hist = getHistory();
  if (!hist.length) {
    vscode.window.showInformationMessage("CopyPasta: no history yet.");
    return;
  }
  const last = hist[0];
  if (last.partsCount === 1) {
    await copy(last.parts[0], "CopyPasta – last bundle copied (1 part).");
    await setSession(null);
    return;
  }
  const pick = await vscode.window.showQuickPick(
    [
      { label: `Copy All (${last.partsCount} parts)`, idx: -1 },
      ...last.parts.map((_, i) => ({
        label: `Copy PART ${i + 1}/${last.partsCount}`,
        idx: i,
      })),
    ],
    { title: "CopyPasta – Last bundle" }
  );
  if (!pick) {
    return;
  }

  if (pick.idx === -1) {
    await copy(
      last.parts
        .map(
          (p, i) =>
            p +
            (i < last.parts.length - 1
              ? "\n=== CONTINUE IN NEXT PART ===\n"
              : "")
        )
        .join("\n"),
      `CopyPasta – last bundle copied (${last.partsCount} parts).`
    );
    await setSession(null);
  } else {
    await copy(
      last.parts[pick.idx],
      `CopyPasta – PART ${pick.idx + 1}/${last.partsCount} copied.`
    );
    await setSession({ id: last.id, index: pick.idx + 1 });
    if (pick.idx + 1 < last.partsCount) {
      const action = await vscode.window.showInformationMessage(
        `Ready for next? (${pick.idx + 2}/${last.partsCount})`,
        "Copy Next Part"
      );
      if (action === "Copy Next Part") {
        await copyNextPart();
      }
    }
  }
}

export async function copyNextPart() {
  const hist = getHistory();
  const sess = getSession();
  if (!sess) {
    vscode.window.showInformationMessage(
      "CopyPasta: no active multi-part session."
    );
    return;
  }
  const bundle = hist.find((h) => h.id === sess.id);
  if (!bundle) {
    vscode.window.showWarningMessage("CopyPasta: session bundle not found.");
    await setSession(null);
    return;
  }
  if (sess.index >= bundle.parts.length) {
    vscode.window.showInformationMessage("CopyPasta: session completed.");
    await setSession(null);
    return;
  }
  const idx = sess.index;
  await vscode.env.clipboard.writeText(bundle.parts[idx]);
  const done = idx + 1;
  if (done >= bundle.parts.length) {
    vscode.window.showInformationMessage(
      `CopyPasta – PART ${done}/${bundle.parts.length} copied. Session finished.`
    );
    await setSession(null);
  } else {
    vscode.window
      .showInformationMessage(
        `CopyPasta – PART ${done}/${bundle.parts.length} copied.`,
        "Copy Next Part"
      )
      .then(async (act) => {
        if (act === "Copy Next Part") {
          await copyNextPart();
        }
      });
    await setSession({ id: bundle.id, index: idx + 1 });
  }
}

export async function showHistory() {
  const hist = getHistory();
  if (!hist.length) {
    vscode.window.showInformationMessage("CopyPasta: history is empty.");
    return;
  }
  const pick = await vscode.window.showQuickPick(
    hist.map((h) => ({
      label: `${new Date(h.createdAt).toLocaleString()} – ${h.project}`,
      detail: `${h.partsCount} part(s), ~${h.tokensApprox.reduce(
        (a, b) => a + b,
        0
      )} tokens`,
      id: h.id,
    })),
    { title: "CopyPasta – History" }
  );
  if (!pick) {
    return;
  }

  const h = hist.find((x) => x.id === pick.id)!;
  const action = await vscode.window.showQuickPick(
    [
      { label: `Copy All (${h.partsCount} parts)`, act: "all" },
      ...h.parts.map((_, i) => ({
        label: `Copy PART ${i + 1}/${h.partsCount}`,
        act: `p:${i}`,
      })),
    ],
    { title: "CopyPasta – Choose action" }
  );
  if (!action) {
    return;
  }
  if (action.act === "all") {
    await vscode.env.clipboard.writeText(
      h.parts
        .map(
          (p, i) =>
            p +
            (i < h.parts.length - 1 ? "\n=== CONTINUE IN NEXT PART ===\n" : "")
        )
        .join("\n")
    );
    vscode.window.showInformationMessage(
      `CopyPasta – bundle copied (${h.partsCount} parts).`
    );
    await setSession(null);
  } else {
    const idx = parseInt(action.act.split(":")[1], 10);
    await vscode.env.clipboard.writeText(h.parts[idx]);
    vscode.window
      .showInformationMessage(
        `CopyPasta – PART ${idx + 1}/${h.partsCount} copied.`,
        "Copy Next Part"
      )
      .then(async (a) => {
        if (a === "Copy Next Part") {
          await copyNextPart();
        }
      });
    await setSession({ id: h.id, index: idx + 1 });
  }
}
