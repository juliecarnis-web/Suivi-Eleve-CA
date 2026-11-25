import React, { useMemo, useState } from 'react';
import { Award, ChevronDown } from 'lucide-react';
import { Competence, Result, Student } from '../types';
import { cn, createDomainSorter } from '../utils/helpers';
import { ExpertTier, getStudentExpertChapters } from '../utils/expertHelpers';
import ExpertBadge from './ExpertBadge';

interface StudentExpertBadgesPanelProps {
  student: Student | undefined;
  competences: Competence[];
  results: Record<string, Record<number, Result>>;
  audience?: 'teacher' | 'parent';
  className?: string;
}

export default function StudentExpertBadgesPanel({
  student,
  competences,
  results,
  audience = 'teacher',
  className
}: StudentExpertBadgesPanelProps) {
  const [domainFilter, setDomainFilter] = useState<string>('all');
  const [tierFilter, setTierFilter] = useState<'all' | ExpertTier>('all');
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  const sortDomains = useMemo(() => createDomainSorter(competences), [competences]);

  const expertChapters = useMemo(() => {
    if (!student) return [];
    return getStudentExpertChapters(student, competences, results);
  }, [student, competences, results]);

  const availableDomains = useMemo(
    () => Array.from(new Set(expertChapters.map(e => e.domain))).sort(sortDomains),
    [expertChapters, sortDomains]
  );

  const effectiveDomainFilter =
    domainFilter !== 'all' && !availableDomains.includes(domainFilter) ? 'all' : domainFilter;

  const filteredChapters = useMemo(() => {
    return expertChapters.filter(entry => {
      if (effectiveDomainFilter !== 'all' && entry.domain !== effectiveDomainFilter) return false;
      if (tierFilter !== 'all' && entry.tier !== tierFilter) return false;
      return true;
    });
  }, [expertChapters, effectiveDomainFilter, tierFilter]);

  const over5Count = useMemo(
    () => expertChapters.filter(e => e.tier === 'expert_over_5').length,
    [expertChapters]
  );
  const at5Count = expertChapters.length - over5Count;

  if (!student) return null;

  return (
    <div className={cn('bg-white border-b border-slate-200 p-6', className)}>
      <button
        type="button"
        aria-expanded={isExpanded}
        onClick={() => setIsExpanded(prev => !prev)}
        className={cn(
          'w-full flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-left group focus:outline-none',
          isExpanded && 'mb-4 pb-3 border-b border-slate-100'
        )}
      >
        <div>
          <h3 className="font-bold text-slate-800 flex items-center gap-2 text-base group-hover:text-emerald-900 transition-colors">
            <Award className="w-5 h-5 text-emerald-700 shrink-0" />
            <span>
              {audience === 'parent'
                ? "Mes badges d'expert.e"
                : 'Badges Expert(e) par chapitre (≥ 5 réussites)'}
            </span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {audience === 'parent'
              ? 'Vert : objectif atteint (5 réussites) · Vert foncé : objectif dépassé (6 à 10 réussites).'
              : 'Vert : 5 réussites atteintes · Vert foncé : seuil des 5 réussites dépassé (6 à 10).'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0 tabular-nums self-start lg:self-center">
          <span className="text-[11px] font-bold px-2.5 py-1 rounded border bg-emerald-800 text-white border-emerald-900">
            Vert foncé (&gt; 5) : {over5Count}
          </span>
          <span className="text-[11px] font-bold px-2.5 py-1 rounded border bg-emerald-100 text-emerald-800 border-emerald-300">
            Vert (5/5) : {at5Count}
          </span>
          <span className="p-1 rounded-lg text-slate-400 group-hover:text-slate-700 group-hover:bg-slate-100 transition">
            <ChevronDown
              className={cn(
                'w-5 h-5 transition-transform duration-200',
                isExpanded && 'rotate-180'
              )}
            />
          </span>
        </div>
      </button>

      {isExpanded && (
        expertChapters.length === 0 ? (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 text-center text-xs text-slate-500">
          {audience === 'parent'
            ? `${student.firstName} n'a pas encore franchi les 5 réussites sur un chapitre. Chaque progrès rapproche du premier badge !`
            : `Aucun chapitre à 5 réussites ou plus pour ${student.firstName} pour le moment.`}
        </div>
      ) : (
        <div className="space-y-3">
          {/* Filtres rapides */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {availableDomains.length > 1 && (
                <select
                  value={effectiveDomainFilter}
                  onChange={e => setDomainFilter(e.target.value)}
                  className="px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-emerald-600 outline-none"
                >
                  <option value="all">Tous les domaines ({availableDomains.length})</option>
                  {availableDomains.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              )}

              <div className="inline-flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                <button
                  type="button"
                  onClick={() => setTierFilter('all')}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-xs font-semibold transition',
                    tierFilter === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  )}
                >
                  Tous ({expertChapters.length})
                </button>
                <button
                  type="button"
                  onClick={() => setTierFilter('expert_over_5')}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-xs font-semibold transition',
                    tierFilter === 'expert_over_5'
                      ? 'bg-emerald-800 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  )}
                >
                  Vert foncé ({over5Count})
                </button>
                <button
                  type="button"
                  onClick={() => setTierFilter('expert_5')}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-xs font-semibold transition',
                    tierFilter === 'expert_5'
                      ? 'bg-emerald-100 text-emerald-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  )}
                >
                  Vert ({at5Count})
                </button>
              </div>
            </div>

            <span className="text-xs font-semibold text-slate-500 tabular-nums">
              {filteredChapters.length} badge{filteredChapters.length > 1 ? 's' : ''} affiché{filteredChapters.length > 1 ? 's' : ''}
            </span>
          </div>

          {filteredChapters.length === 0 ? (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-center text-xs text-slate-500">
              Aucun badge dans ce filtre.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5 max-h-[320px] overflow-y-auto pr-1">
              {filteredChapters.map(entry => (
                <div
                  key={entry.competence.id}
                  className={cn(
                    'rounded-xl border p-3 flex items-start justify-between gap-2.5 transition',
                    entry.tier === 'expert_over_5'
                      ? 'bg-emerald-50/50 border-emerald-300'
                      : 'bg-slate-50/70 border-slate-200'
                  )}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 mb-0.5">
                      <span className="font-mono font-bold text-slate-700 bg-white border border-slate-200 px-1.5 py-0.5 rounded">
                        {entry.code}
                      </span>
                      <span className="truncate">{entry.subDomain || entry.domain}</span>
                    </div>
                    <p className="text-xs font-bold text-slate-800 leading-snug" title={entry.title}>
                      {entry.title || entry.code}
                    </p>
                  </div>

                  <ExpertBadge score={entry.score} compact />
                </div>
              ))}
            </div>
          )}
        </div>
      )
      )}
    </div>
  );
}
