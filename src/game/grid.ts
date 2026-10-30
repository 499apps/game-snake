/**
 * Grid helpers for Snake (pure). Screen-style coordinates: +x right, +y down (toward the player).
 */
import { directionVector, oppositeDirection, type Direction } from '../kit/input';

export interface Cell {
  x: number;
  y: number;
}

export function sameCell(a: Cell, b: Cell): boolean {
  return a.x === b.x && a.y === b.y;
}

/** The snake may turn left or right but never straight back into itself. */
export function turn(current: Direction, requested: Direction): Direction {
  return requested === oppositeDirection(current) ? current : requested;
}

/** One step in a direction, wrapping around the edges of a size x size board. */
export function stepCell(cell: Cell, dir: Direction, size: number): Cell {
  const v = directionVector(dir);
  const wrap = (n: number) => ((n % size) + size) % size;
  return { x: wrap(cell.x + v.x), y: wrap(cell.y + v.y) };
}

export function inBounds(cell: Cell, size: number): boolean {
  return (
    Number.isInteger(cell.x) &&
    Number.isInteger(cell.y) &&
    cell.x >= 0 &&
    cell.y >= 0 &&
    cell.x < size &&
    cell.y < size
  );
}
