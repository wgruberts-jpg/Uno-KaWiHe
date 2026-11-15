import React from 'react';

interface TableDirectionArrowsProps {
  direction: 1 | -1; // 1 = Horário (Clockwise), -1 = Anti-horário (Counter-clockwise)
  className?: string;
  children?: React.ReactNode;
  onDrop?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
}

export const TableDirectionArrows: React.FC<TableDirectionArrowsProps> = ({
  direction,
  className = '',
  children,
  onDrop,
  onDragOver,
}) => {
  const isClockwise = direction === 1;

  // Reduced height to ~85% of previous size (260px -> 220px, 290px -> 246px)
  return (
    <div
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`relative w-[360px] h-[220px] sm:w-[420px] sm:h-[246px] rounded-[44px] bg-gradient-to-br from-emerald-600 via-teal-700 to-emerald-800 border-4 border-amber-300 shadow-[0_20px_50px_rgba(0,0,0,0.35)] ring-4 ring-emerald-500/50 flex flex-col items-center justify-between p-1.5 sm:p-2 overflow-hidden select-none ${className}`}
      aria-label={`Mesa central do jogo - Sentido: ${isClockwise ? 'Horário' : 'Anti-horário'}`}
    >
      {/* Direction Arrows SVG surrounding the entire felt mat perimeter */}
      <div 
        className={`absolute inset-0 pointer-events-none flex items-center justify-center transition-transform duration-700 ease-in-out ${
          isClockwise ? 'rotate-0' : 'scale-x-[-1]'
        }`}
      >
        <svg
          viewBox="0 0 420 246"
          className="w-full h-full pointer-events-none drop-shadow-[0_2px_8px_rgba(250,204,21,0.6)]"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="arrowGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fef08a" />
              <stop offset="100%" stopColor="#f59e0b" />
            </linearGradient>
            <filter id="arrowGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="0" stdDeviation="3.5" floodColor="#fbbf24" floodOpacity="0.85" />
            </filter>
          </defs>

          {/* Guide Track around the outer border of the felt */}
          <rect
            x="20"
            y="18"
            width="380"
            height="210"
            rx="34"
            fill="none"
            stroke="rgba(255, 255, 255, 0.2)"
            strokeWidth="2.5"
            strokeDasharray="6 6"
          />

          {/* Top Direction Arrow (Left to Right) */}
          <g filter="url(#arrowGlow)">
            <path
              d="M 50 18 L 360 18"
              fill="none"
              stroke="url(#arrowGrad)"
              strokeWidth="5"
              strokeLinecap="round"
            />
            {/* Arrowhead at top right */}
            <polygon
              points="350,9 372,18 350,27"
              fill="#f59e0b"
              stroke="#fef08a"
              strokeWidth="1.5"
            />
          </g>

          {/* Bottom Direction Arrow (Right to Left) */}
          <g filter="url(#arrowGlow)">
            <path
              d="M 370 228 L 60 228"
              fill="none"
              stroke="url(#arrowGrad)"
              strokeWidth="5"
              strokeLinecap="round"
            />
            {/* Arrowhead at bottom left */}
            <polygon
              points="70,219 48,228 70,237"
              fill="#f59e0b"
              stroke="#fef08a"
              strokeWidth="1.5"
            />
          </g>
        </svg>
      </div>

      {/* Center Table Content (Piles, Cards, Animations, Indicators) */}
      <div className="relative z-20 flex flex-col items-center justify-between w-full h-full py-0.5">
        {children}
      </div>
    </div>
  );
};
