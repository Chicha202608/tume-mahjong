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
  dora?: boolean;
  className?: string;
}

const sizeMap = {
  xs: { outer: 'w-8 aspect-[3/4]', w: 32, h: 42.66, shadow: '1px 2px 0 #a8a8a8' },
  sm: { outer: 'w-10 aspect-[3/4]', w: 40, h: 53.33, shadow: '1px 2px 0 #a8a8a8' },
  md: { outer: 'w-12 aspect-[3/4]', w: 48, h: 64, shadow: '2px 3px 0 #a0a0a0' },
  lg: { outer: 'w-14 aspect-[3/4]', w: 56, h: 74.66, shadow: '2px 4px 0 #989898' },
};

export default function TileCard({ tile, size = 'md', onClick, highlighted, faceDown, rotated, dora, className = '' }: Props) {
  const { label } = tileDisplay(tile);
  const { outer, w, h, shadow } = sizeMap[size];
  const showShimmer = dora && !faceDown;

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
          {showShimmer && <div className="dora-shimmer-overlay" />}
          <img
            src={faceDown ? tileBackUrl() : tileImageUrl(tile)}
            alt={label}
            className="w-full h-full object-contain pointer-events-none relative z-0"
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
      {showShimmer && <div className="dora-shimmer-overlay" />}
      <img
        src={faceDown ? tileBackUrl() : tileImageUrl(tile)}
        alt={label}
        className="w-full h-full object-contain pointer-events-none relative z-0"
        draggable={false}
      />
    </div>
  );
}
