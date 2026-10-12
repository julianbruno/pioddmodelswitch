import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

/** Model-only dialog; native TUI imports stay lazy for plain Node and RPC consumers. */
export async function selectModel(
  ui: Pick<ExtensionContext["ui"], "custom" | "select">,
  options: string[],
  load = async () => import("@earendil-works/pi-tui"),
): Promise<string | undefined> {
  if (typeof ui.custom !== "function") return ui.select("Model", options);
  const { SelectList } = await load();
  return ui.custom<string | undefined>((tui, theme, _kb, done) => {
    const items = options.map(value => ({ value, label: value }));
    let index = 0;
    let visible = 0;
    let list: InstanceType<typeof SelectList>;
    const resize = () => {
      // Reserve a row for the native position indicator and one for Pi's surrounding UI.
      const next = Math.max(1, Math.min(10, options.length, tui.terminal.rows - 2));
      if (list && next === visible) return;
      visible = next;
      list = new SelectList(items, visible, {
        selectedPrefix: text => theme.fg("accent", text),
        selectedText: text => theme.fg("accent", text),
        description: text => theme.fg("muted", text),
        scrollInfo: text => theme.fg("dim", text),
        noMatch: text => theme.fg("warning", text),
      });
      list.setSelectedIndex(index);
      list.onSelectionChange = () => { index = items.findIndex(item => item.value === list.getSelectedItem()?.value); };
      list.onSelect = item => done(item.value);
      list.onCancel = () => done(undefined);
    };
    resize();
    return {
      render(width) {
        resize();
        // At one row, retain the selected item rather than the position indicator.
        return list.render(width).slice(0, Math.max(1, tui.terminal.rows - 1));
      },
      invalidate() { list.invalidate(); },
      handleInput(data) { resize(); list.handleInput(data); tui.requestRender(); },
      handleMouse(event) { resize(); const result = list.handleMouse?.(event); if (result?.render) tui.requestRender(); return result; },
    };
  });
}
