export function attachCodeCopyButtons(): void {
  if (typeof navigator?.clipboard?.writeText !== 'function') {
    // Clipboard API not available
    return;
  }

  const codeBlocks = Array.from(document.querySelectorAll('pre > code')) as HTMLElement[];
  if (!codeBlocks.length) return;

  for (const code of codeBlocks) {
    // Avoid duplicating buttons
    if (code.parentElement?.querySelector('.code-copy-btn')) continue;

    const pre = code.parentElement as HTMLElement;
    if (!pre) continue;

    const btn = document.createElement('button');
    btn.textContent = 'Copy';
    btn.className = 'code-copy-btn';
    btn.style.position = 'absolute';
    btn.style.top = '8px';
    btn.style.right = '8px';
    btn.style.padding = '4px 8px';
    btn.style.fontSize = '12px';
    btn.style.cursor = 'pointer';

    // container positioning
    const wrapper = document.createElement('div');
    wrapper.style.position = 'relative';
    wrapper.style.display = 'inline-block';

    // Move pre into wrapper
    const parent = pre.parentElement;
    if (!parent) continue;
    parent.replaceChild(wrapper, pre);
    wrapper.appendChild(pre);

    // Add button to wrapper
    wrapper.appendChild(btn);

    // tooltip/confirmation
    const tooltip = document.createElement('span');
    tooltip.textContent = 'Copied!';
    tooltip.style.position = 'absolute';
    tooltip.style.top = '0';
    tooltip.style.right = '0';
    tooltip.style.background = '#333';
    tooltip.style.color = '#fff';
    tooltip.style.padding = '2px 6px';
    tooltip.style.borderRadius = '4px';
    tooltip.style.fontSize = '11px';
    tooltip.style.opacity = '0';
    tooltip.style.transition = 'opacity 0.3s';
    btn.appendChild(tooltip);

    let timeout: number | undefined;

    btn.addEventListener('click', async () => {
      try {
        const text = code.innerText;
        await navigator.clipboard.writeText(text);
        tooltip.style.opacity = '1';
        window.clearTimeout(timeout);
        timeout = window.setTimeout(() => (tooltip.style.opacity = '0'), 1500);
      } catch {
        // ignore
      }
    });
  }
}
