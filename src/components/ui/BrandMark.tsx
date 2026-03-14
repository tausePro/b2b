'use client';

import { useState } from 'react';
import { cn, normalizeHexColor } from '@/lib/utils';

interface BrandMarkProps {
  name: string;
  logoUrl?: string | null;
  color?: string | null;
  alt?: string;
  className?: string;
  imageClassName?: string;
  initialsClassName?: string;
}

function getInitials(name: string): string {
  const tokens = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (tokens.length === 0) {
    return 'IM';
  }

  return tokens
    .slice(0, 2)
    .map((token) => token[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2);
}

export default function BrandMark({
  name,
  logoUrl,
  color,
  alt,
  className,
  imageClassName,
  initialsClassName,
}: BrandMarkProps) {
  const [imageError, setImageError] = useState(false);
  const showLogo = Boolean(logoUrl) && !imageError;
  const resolvedColor = normalizeHexColor(color);

  return (
    <div
      className={cn('flex shrink-0 items-center justify-center overflow-hidden', className)}
      style={showLogo ? undefined : { backgroundColor: resolvedColor }}
    >
      {showLogo ? (
        <img
          src={logoUrl ?? ''}
          alt={alt || `Logo de ${name}`}
          className={cn('h-full w-full object-contain bg-white', imageClassName)}
          onError={() => setImageError(true)}
        />
      ) : (
        <span className={cn('font-bold text-white', initialsClassName)}>{getInitials(name)}</span>
      )}
    </div>
  );
}
