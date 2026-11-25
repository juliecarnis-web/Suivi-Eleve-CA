import React from 'react';
import { Award, Star } from 'lucide-react';
import { cn } from '../utils/helpers';
import { getExpertTier } from '../utils/expertHelpers';

interface ExpertBadgeProps {
  score: number | null | undefined;
  compact?: boolean;
  showScore?: boolean;
  suffix?: string;
  className?: string;
}

/**
 * Badge Expert à 2 niveaux :
 * - Vert (score === 5) : Expert ayant atteint les 5 réussites
 * - Vert foncé (score > 5) : Expert ayant dépassé les 5 réussites (6 à 10)
 */
export default function ExpertBadge({
  score,
  compact = false,
  showScore = true,
  suffix,
  className
}: ExpertBadgeProps) {
  const tier = getExpertTier(score);
  if (!tier) return null;

  const numericScore = Number(score);
  const isOver5 = tier === 'expert_over_5';

  return (
    <span
      title={
        isOver5
          ? `Expert+ : objectif dépassé (${numericScore}/5 réussites)`
          : 'Expert : objectif atteint (5/5 réussites)'
      }
      className={cn(
        'inline-flex items-center gap-1 border rounded-md font-bold whitespace-nowrap shrink-0 tabular-nums transition-colors',
        compact ? 'text-[10px] px-1.5 py-0.5' : 'text-[11px] px-2 py-0.5',
        isOver5
          ? 'bg-emerald-800 text-white border-emerald-900 shadow-2xs'
          : 'bg-emerald-100 text-emerald-800 border-emerald-300',
        className
      )}
    >
      {isOver5 ? (
        <Star className={cn('shrink-0 fill-current', compact ? 'w-2.5 h-2.5 text-emerald-200' : 'w-3 h-3 text-emerald-200')} />
      ) : (
        <Award className={cn('shrink-0', compact ? 'w-2.5 h-2.5 text-emerald-700' : 'w-3 h-3 text-emerald-700')} />
      )}
      <span>{isOver5 ? 'Expert+' : 'Expert'}</span>
      {showScore && (
        <span className={cn('font-extrabold', isOver5 ? 'text-emerald-100' : 'text-emerald-900')}>
          {numericScore}/5
        </span>
      )}
      {suffix && (
        <span className={cn('font-semibold', isOver5 ? 'text-emerald-100' : 'text-emerald-700')}>
          {suffix}
        </span>
      )}
    </span>
  );
}
