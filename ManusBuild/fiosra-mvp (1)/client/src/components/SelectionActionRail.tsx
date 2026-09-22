import React from "react";
import { CompanionMove } from "@/lib/companionMoves";

const FIOSRA_SYMBOL_URL = "/manus-storage/fiosra-symbol-source_88e00f09.png";

interface SelectionActionRailProps {
  top: number;
  left: number;
  moves: CompanionMove[];
  onSelectAction: (move: CompanionMove) => void;
}

export function SelectionActionRail({ top, left, moves, onSelectAction }: SelectionActionRailProps) {
  const clampedTop = Math.max(72, top);
  const clampedLeft = Math.max(16, Math.min(left, window.innerWidth - 380));

  return (
    <div
      role="toolbar"
      aria-label="Ways to think from this passage"
      className="fixed z-40 flex max-w-[calc(100vw-2rem)] items-center divide-x divide-[#383C42] rounded-lg bg-[var(--color-obsidian)] p-1 text-white shadow-xl animate-in fade-in zoom-in-95 duration-150"
      style={{ top: `${clampedTop}px`, left: `${clampedLeft}px` }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="flex shrink-0 items-center gap-1.5 px-2 py-1 text-[11px] font-medium text-[#C9D7FF]">
        <img src={FIOSRA_SYMBOL_URL} alt="" className="h-3.5 w-4 object-contain brightness-0 invert opacity-90" />
        <span className="hidden sm:inline">Think from passage</span>
        <span className="sm:hidden">Think</span>
      </div>

      <div className="flex min-w-0 items-center overflow-x-auto pl-1">
        {moves.map((move) => (
          <button
            key={move.id}
            type="button"
            onClick={() => onSelectAction(move)}
            title={move.description}
            className="whitespace-nowrap px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:text-[#C9D7FF] active:scale-97"
          >
            {move.title}
          </button>
        ))}
      </div>
    </div>
  );
}
