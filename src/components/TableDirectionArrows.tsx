import React from 'react';

interface TableDirectionArrowsProps {
  direction: 1 | -1; // 1 = Horário (Clockwise), -1 = Anti-horário (Counter-clockwise)
  className?: string;
}

export const TableDirectionArrows: React.FC<TableDirectionArrowsProps> = ({
  direction,
  className = '',
}) => {
  const isClockwise = direction === 1;

  // Colors:
  // Horário: Amarelo Sol vibrante
  // Anti-horário: Rosa/Coral vibrante
  const fillColor = isClockwise ? '#fbbf24' : '#f43f5e';
  const strokeColor = isClockwise ? '#fef08a' : '#fecdd3';
  const filterId = isClockwise ? 'glow-orange' : 'glow-red';

  return (
    <div
      className={`absolute inset-0 pointer-events-none flex items-center justify-center transition-all duration-500 ${className}`}
      aria-label={`Sentido do jogo: ${isClockwise ? 'Horário' : 'Anti-horário'}`}
    >
      <svg
        viewBox="0 0 400 400"
        className="absolute -inset-10 sm:-inset-14 m-auto w-[340px] h-[340px] sm:w-[430px] sm:h-[430px] overflow-visible transition-transform duration-700 ease-out"
        style={{
          // Mirror horizontally when clockwise so left points up and right points down!
          transform: isClockwise ? 'scaleX(-1)' : 'scaleX(1)',
        }}
      >
        <defs>
          <filter id={filterId} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow
              dx="0"
              dy="0"
              stdDeviation="6"
              floodColor={fillColor}
              floodOpacity="0.45"
            />
          </filter>

          <linearGradient id="arrow-gradient-left" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={isClockwise ? '#fbbf24' : '#f87171'} />
            <stop offset="100%" stopColor={isClockwise ? '#d97706' : '#dc2626'} />
          </linearGradient>

          <linearGradient id="arrow-gradient-right" x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor={isClockwise ? '#fbbf24' : '#f87171'} />
            <stop offset="100%" stopColor={isClockwise ? '#d97706' : '#dc2626'} />
          </linearGradient>
        </defs>

        {/* Left Curved Arrow (Quarter-circle arc with flared arrowhead) */}
        <g filter={`url(#${filterId})`}>
          <path
            d="M 112.82 75.49 A 168 168 0 0 0 92.01 328.7 L 80.44 342.48 L 158.1 346.11 L 124.15 290.39 L 112.58 304.18 A 136 136 0 0 1 112.82 75.49 Z"
            fill="url(#arrow-gradient-left)"
            stroke={strokeColor}
            strokeWidth="1.5"
            strokeLinejoin="round"
            className="transition-colors duration-500 opacity-95"
          />
        </g>

        {/* Right Curved Arrow (Centrosymmetric: 180° rotation around center 200, 200) */}
        <g filter={`url(#${filterId})`} transform="rotate(180 200 200)">
          <path
            d="M 112.82 75.49 A 168 168 0 0 0 92.01 328.7 L 80.44 342.48 L 158.1 346.11 L 124.15 290.39 L 112.58 304.18 A 136 136 0 0 1 112.82 75.49 Z"
            fill="url(#arrow-gradient-right)"
            stroke={strokeColor}
            strokeWidth="1.5"
            strokeLinejoin="round"
            className="transition-colors duration-500 opacity-95"
          />
        </g>
      </svg>
    </div>
  );
};
