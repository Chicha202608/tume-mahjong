import { Tile } from '@/types';
import { tileImageUrl, tileBackUrl } from '@/tileImages';
import { tileDisplay } from '@/gameLogic';

interface Props {
  tile: Tile;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  onClick?: () => void;
  highlighted?: boolean;
  faceDown?: boolean;
  rotated?: boolean;
  className?: string;
}

const sizeMap = {
  xs: { outer: 'w-8 h-11', w: 32, h: 44, shadow: '1px 2px 0 #a8a8a8' },
  sm: { outer: 'w-10 h-14', w: 40, h: 56, shadow: '1px 2px 0 #a8a8a8' },
  md: { outer: 'w-13 h-18', w: 52, h: 72, shadow: '2px 3px 0 #a0a0a0' },
  lg: { outer: 'w-16 h-22', w: 64, h: 88, shadow: '2px 4px 0 #989898' },
};

export default function TileCard({ tile, size = 'md', onClick, highlighted, faceDown, rotated, className = '' }: Props) {
  const { label } = tileDisplay(tile);
  const { outer, w, h, shadow } = sizeMap[size];

  const base =
    'relative flex flex-col items-center justify-center rounded-md select-none transition-all duration-150 overflow-hidden bg-[#f8f4e8] border border-[#d0c8b0]';
  const interactive = onClick ? 'cursor-pointer' : '';
  const highlight = highlighted ? 'ring-2 ring-amber-400 border-amber-400' : '';
  const hoverStyle = onClick && !faceDown ? 'hover:-translate-y-1 hover:shadow-lg' : '';

  if (rotated) {
    return (
      <div
        className="flex items-center justify-center"
        style={{ width: `${h}px`, height: `${w}px` }}
      >
        <div
          className={`${base} ${outer} ${interactive} ${highlight} ${className}`}
          style={{ boxShadow: faceDown ? 'none' : shadow, transform: 'rotate(90deg)' }}
          onClick={onClick}
          title={label}
        >
          <img
            src={faceDown ? tileBackUrl() : tileImageUrl(tile)}
            alt={label}
            className="w-full h-full object-contain pointer-events-none"
            draggable={false}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className={`${base} ${outer} ${interactive} ${highlight} ${hoverStyle} ${className}`}
      style={{ boxShadow: faceDown ? 'none' : shadow }}
      onClick={onClick}
      title={label}
    >
      <img
        src={faceDown ? tileBackUrl() : tileImageUrl(tile)}
        alt={label}
        className="w-full h-full object-contain pointer-events-none"
        draggable={false}
      />
    </div>
  );
}
