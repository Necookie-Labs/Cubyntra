import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { isSpotlit, positionKey, SlotOutline, spotlightKeys } from '../src/three/spotlight';

describe('spotlight selection', () => {
  it('lights everything when there is no spotlight', () => {
    expect(spotlightKeys(null)).toBeNull();
    expect(isSpotlit([1, 1, 1], null)).toBe(true);
  });

  it('lights exactly the listed positions', () => {
    const keys = spotlightKeys([{ position: [1, 1, 1] }, { position: [0, 1, 1] }]);
    expect(isSpotlit([1, 1, 1], keys)).toBe(true);
    expect(isSpotlit([0, 1, 1], keys)).toBe(true);
    expect(isSpotlit([1, 1, 0], keys)).toBe(false);
    expect(isSpotlit([-1, -1, -1], keys)).toBe(false);
    let lit = 0;
    for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) if (isSpotlit([x, y, z], keys)) lit++;
    expect(lit).toBe(2);
  });

  it('an empty list fades everything', () => {
    expect(isSpotlit([0, 0, 1], spotlightKeys([]))).toBe(false);
  });

  it('rejects positions off the 3x3x3 grid', () => {
    expect(() => spotlightKeys([{ position: [2, 0, 0] }])).toThrow();
    expect(() => spotlightKeys([{ position: [0.5, 0, 0] }])).toThrow();
    expect(positionKey([-1, 0, 1])).toBe('-1,0,1');
  });
});

describe('SlotOutline', () => {
  it('is twelve flat bars hugging one cubie, hidden until placed', () => {
    const outline = new SlotOutline('#1D5FB8');
    expect(outline.group.children).toHaveLength(12);
    expect(outline.group.visible).toBe(false);
    const box = new THREE.Box3().setFromObject(outline.group);
    const size = box.getSize(new THREE.Vector3());
    expect(size.x).toBeGreaterThan(1.1);
    expect(size.x).toBeLessThan(1.25);
    const material = (outline.group.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial;
    expect(material).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect(material.transparent).toBe(false);
  });

  it('moves to a position, hides on null and disposes its resources', () => {
    const outline = new SlotOutline('#1D5FB8');
    outline.setPosition([1, -1, 1]);
    expect(outline.group.visible).toBe(true);
    expect(outline.group.position.toArray()).toEqual([1, -1, 1]);
    outline.setPosition(null);
    expect(outline.group.visible).toBe(false);
    expect(() => outline.setPosition([0, 3, 0])).toThrow();
    outline.setColor('#8CC4FF');
    const mesh = outline.group.children[0] as THREE.Mesh;
    expect((mesh.material as THREE.MeshBasicMaterial).color.getHexString()).toBe('8cc4ff');
    const g = vi.spyOn(mesh.geometry, 'dispose');
    const m = vi.spyOn(mesh.material as THREE.Material, 'dispose');
    outline.dispose();
    expect(g).toHaveBeenCalledOnce();
    expect(m).toHaveBeenCalledOnce();
  });
});
