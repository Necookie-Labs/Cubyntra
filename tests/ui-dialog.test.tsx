// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Dialog } from '@/components/ui/Dialog';
import { getFocusable, trapTab } from '@/components/ui/focus';

afterEach(cleanup);

function Harness({ onClose }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <Dialog
        open={open}
        onClose={() => {
          onClose?.();
          setOpen(false);
        }}
        title="Pair your phone"
        description="Scan the code"
        footer={<button type="button">Done</button>}
      >
        <input aria-label="Code" />
      </Dialog>
    </>
  );
}

function openDialog() {
  const opener = screen.getByRole('button', { name: 'Open' });
  opener.focus();
  fireEvent.click(opener);
  return { opener, dialog: screen.getByRole('dialog') };
}

describe('Dialog', () => {
  it('is a labelled, described modal dialog', () => {
    render(<Harness />);
    const { dialog } = openDialog();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(screen.getByRole('dialog', { name: 'Pair your phone' })).toBe(dialog);
    expect(document.getElementById(dialog.getAttribute('aria-describedby')!)?.textContent).toBe('Scan the code');
  });

  it('moves focus into the dialog when it opens', () => {
    render(<Harness />);
    const { dialog } = openDialog();
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('focuses the dialog itself when its autofocus button is disabled', () => {
    // The checkpoint sheet's "Check this face" is disabled until the camera is live.
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    render(
      <Dialog open onClose={() => {}} title="Show me your cube" footer={<button type="button" data-autofocus disabled>Check</button>}>
        <p>Waiting for the camera</p>
      </Dialog>
    );
    expect(document.activeElement).toBe(screen.getByRole('dialog'));
    opener.remove();
  });

  it('scrolls only its body, so the actions stay in view on a short screen', () => {
    render(<Harness />);
    const { dialog } = openDialog();
    const body = screen.getByTestId('dialog-body');
    expect(body.className).toMatch(/\boverflow-y-auto\b/);
    expect(body.className).toMatch(/\bmin-h-0\b/);
    expect(dialog.className).not.toMatch(/overflow-y-auto/);
    const done = screen.getByRole('button', { name: 'Done' });
    expect(body.contains(done)).toBe(false);
    expect(dialog.contains(done)).toBe(true);
    expect(body.contains(screen.getByRole('textbox', { name: 'Code' }))).toBe(true);
  });

  it('closes on Escape and gives focus back to the opener', () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const { opener, dialog } = openDialog();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('wraps Tab from the last control to the first, and Shift+Tab back', () => {
    render(<Harness />);
    const { dialog } = openDialog();
    const items = getFocusable(dialog);
    const first = items[0];
    const last = items[items.length - 1];
    expect(last.textContent).toBe('Done');

    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(first);

    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it('closes when the scrim is clicked', () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    openDialog();
    fireEvent.click(screen.getByTestId('dialog-scrim'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('focus helpers', () => {
  it('skips disabled, hidden and negative-tabindex elements', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <button>a</button>
      <button disabled>b</button>
      <button tabindex="-1">c</button>
      <div aria-hidden="true"><button>d</button></div>
      <a href="#x">e</a>
      <input type="hidden" />
    `;
    document.body.appendChild(root);
    expect(getFocusable(root).map((el) => el.textContent)).toEqual(['a', 'e']);
    root.remove();
  });

  it('ignores keys other than Tab', () => {
    const root = document.createElement('div');
    expect(trapTab({ key: 'Enter', shiftKey: false }, root)).toBe(false);
  });

  it('pulls focus back in when it has escaped the container', () => {
    const root = document.createElement('div');
    root.innerHTML = '<button>in-1</button><button>in-2</button>';
    const outside = document.createElement('button');
    document.body.append(outside, root);
    outside.focus();
    expect(trapTab({ key: 'Tab', shiftKey: false }, root)).toBe(true);
    expect(document.activeElement?.textContent).toBe('in-1');
    root.remove();
    outside.remove();
  });
});
