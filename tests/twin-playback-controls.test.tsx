// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { PlaybackControls, type PlaybackControlsProps } from '@/components/twin/PlaybackControls';
import { MoveChips } from '@/components/twin/MoveChips';
import { currentMoveIndex, usePlayback } from '@/components/twin/usePlayback';
import { PlaybackController } from '@/three/playback';
import { createSolvedCubeState } from '@/cube/constants';
import { parseAlgorithm } from '@/cube/transforms';

afterEach(cleanup);

function setup(overrides: Partial<PlaybackControlsProps> = {}) {
  const props: PlaybackControlsProps = {
    playing: false,
    index: 1,
    total: 4,
    speed: 1,
    loop: false,
    onPlay: vi.fn(),
    onPause: vi.fn(),
    onStepBack: vi.fn(),
    onStepForward: vi.fn(),
    onSpeedChange: vi.fn(),
    onLoopChange: vi.fn(),
    ...overrides,
  };
  render(<PlaybackControls {...props} />);
  return props;
}

describe('PlaybackControls', () => {
  it('wires every control to its handler', () => {
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    fireEvent.click(screen.getByRole('button', { name: 'Step back' }));
    fireEvent.click(screen.getByRole('button', { name: 'Step forward' }));
    fireEvent.click(screen.getByRole('button', { name: 'Half speed' }));
    fireEvent.click(screen.getByRole('button', { name: 'Loop' }));
    expect(props.onPlay).toHaveBeenCalledOnce();
    expect(props.onStepBack).toHaveBeenCalledOnce();
    expect(props.onStepForward).toHaveBeenCalledOnce();
    expect(props.onSpeedChange).toHaveBeenCalledWith(0.5);
    expect(props.onLoopChange).toHaveBeenCalledWith(true);
  });

  it('shows Pause while playing', () => {
    const props = setup({ playing: true });
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(props.onPause).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Play' })).toBeNull();
  });

  it('reports half speed and loop as pressed toggles', () => {
    const props = setup({ speed: 0.5, loop: true });
    expect(screen.getByRole('button', { name: 'Half speed' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Loop' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Half speed' }));
    expect(props.onSpeedChange).toHaveBeenCalledWith(1);
  });

  it('disables stepping past either end, and play with nothing loaded', () => {
    setup({ index: 0 });
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Step back' }).disabled).toBe(true);
    cleanup();
    setup({ index: 4 });
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Step forward' }).disabled).toBe(true);
    cleanup();
    setup({ index: 0, total: 0 });
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Play' }).disabled).toBe(true);
  });
});

describe('usePlayback with MoveChips', () => {
  function Twin({ controller }: { controller: PlaybackController }) {
    const snap = usePlayback(controller);
    if (!snap) return null;
    return (
      <>
        <MoveChips moves={snap.moves} current={currentMoveIndex(snap)} />
        <PlaybackControls
          {...snap}
          onPlay={() => void controller.play()}
          onPause={() => controller.pause()}
          onStepBack={() => void controller.stepBack()}
          onStepForward={() => void controller.stepForward()}
          onSpeedChange={(s) => controller.setSpeed(s)}
          onLoopChange={(l) => controller.setLoop(l)}
        />
      </>
    );
  }

  it('highlights the move in sync with the animation', async () => {
    let finishTurn: () => void = () => {};
    const twin = {
      animateMove: () => new Promise<void>((resolve) => (finishTurn = resolve)),
      requestSync: () => {},
    };
    const controller = new PlaybackController(twin, { sleep: () => Promise.resolve() });
    controller.load(createSolvedCubeState(), parseAlgorithm("R U R'"));
    render(<Twin controller={controller} />);
    const current = () => within(screen.getByRole('list')).getAllByRole('listitem').findIndex((c) => c.dataset.state === 'current');
    expect(current()).toBe(0);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Step forward' }));
      await Promise.resolve();
    });
    expect(current()).toBe(0); // move 0 is animating
    await act(async () => {
      finishTurn();
      await controller.whenIdle();
    });
    expect(current()).toBe(1);
    const chips = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(chips[0].dataset.state).toBe('done');

    act(() => controller.setSpeed(0.5));
    expect(screen.getByRole('button', { name: 'Half speed' }).getAttribute('aria-pressed')).toBe('true');
  });
});
