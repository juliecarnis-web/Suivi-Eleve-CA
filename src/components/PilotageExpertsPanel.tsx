import React, { useMemo, useState } from 'react';
import { Award, Copy, Check, Search, Filter, Users, ChevronDown } from 'lucide-react';
import { Competence, Result, Student } from '../types';
import { cn, createDomainSorter, getCode, getDomain, getGrade } from '../utils/helpers';
import { cleanChapterLabel, ExpertTier, getAllChapterExperts, ChapterExpertEntry } from '../utils/expertHelpers';
import ExpertBadge from './ExpertBadge';

interface PilotageExpertsPanelProps {
  activeStudents: Student[];
  competences: Competence[];
  results: Record<string, Record<number, Result>>;
  uniqueGrades: string[];
}

export default function PilotageExpertsPanel({
  activeStudents,
  competences,
  results,
  uniqueGrades
}: PilotageExpertsPanelProps) {
  const [filterGrade, setFilterGrade] = useState<string>('all');
  const [filterDomain, setFilterDomain] = useState<string>('all');
  const [filterSubDomain, setFilterSubDomain] = useState<string>('all');
  const [filterChapterCode, setFilterChapterCode] = useState<string>('all');
  const [tierFilter, setTierFilter] = useState<'all' | ExpertTier>('all');
  const [studentQuery, setStudentQuery] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  const sortDomains = useMemo(() => createDomainSorter(competences), [competences]);

  const allExpertEntries = useMemo(
    () => getAllChapterExperts(activeStudents, competences, results),
    [activeStudents, competences, results]
  );

  const uniqueDomains = useMemo(
    () => Array.from(new Set(competences.map(c => getDomain(c)).filter(Boolean))).sort(sortDomains),
    [competences, sortDomains]
  );

  const uniqueSubDomains = useMemo(() => {
    const set = new Set<string>();
    competences.forEach(c => {
      if (filterGrade !== 'all' && getGrade(c) !== filterGrade) return;
      if (filterDomain !== 'all' && getDomain(c) !== filterDomain) return;
      const sd = (c.subDomain || '').trim() || 'Général';
      set.add(sd);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));
  }, [competences, filterGrade, filterDomain]);

  const availableChapters = useMemo(() => {
    const map = new Map<string, { code: string; label: string }>();
    competences.forEach(c => {
      if (filterGrade !== 'all' && getGrade(c) !== filterGrade) return;
      if (filterDomain !== 'all' && getDomain(c) !== filterDomain) return;
      const sd = (c.subDomain || '').trim() || 'Général';
      if (filterSubDomain !== 'all' && sd !== filterSubDomain) return;
      const code = getCode(c);
      if (!code) return;
      if (!map.has(code)) {
        const cleaned = cleanChapterLabel(c.title);
        map.set(code, {
          code,
          label: cleaned ? `${code} — ${cleaned}` : code
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code, 'fr', { numeric: true }));
  }, [competences, filterGrade, filterDomain, filterSubDomain]);

  const filteredEntries = useMemo(() => {
    const q = studentQuery.trim().toLowerCase();
    return allExpertEntries.filter(entry => {
      if (filterGrade !== 'all' && entry.grade !== filterGrade) return false;
      if (filterDomain !== 'all' && entry.domain !== filterDomain) return false;
      if (filterSubDomain !== 'all' && entry.subDomain !== filterSubDomain) return false;
      if (filterChapterCode !== 'all' && entry.code !== filterChapterCode) return false;
      if (tierFilter !== 'all' && entry.tier !== tierFilter) return false;
      if (q) {
        const fullName = `${entry.student.firstName} ${entry.student.lastName}`.toLowerCase();
        if (!fullName.includes(q)) return false;
      }
      return true;
    });
  }, [
    allExpertEntries,
    filterGrade,
    filterDomain,
    filterSubDomain,
    filterChapterCode,
    tierFilter,
    studentQuery
  ]);

  const groupedByChapter = useMemo(() => {
    const groupsMap = new Map<
      string,
      {
        key: string;
        code: string;
        title: string;
        domain: string;
        subDomain: string;
        grade: string;
        experts: ChapterExpertEntry[];
        over5Count: number;
        at5Count: number;
      }
    >();

    filteredEntries.forEach(entry => {
      const key = `${entry.grade}:::${entry.competence.id}`;
      let grp = groupsMap.get(key);
      if (!grp) {
        grp = {
          key,
          code: entry.code,
          title: entry.title,
          domain: entry.domain,
          subDomain: entry.subDomain,
          grade: entry.grade,
          experts: [],
          over5Count: 0,
          at5Count: 0
        };
        groupsMap.set(key, grp);
      }
      grp.experts.push(entry);
      if (entry.tier === 'expert_over_5') grp.over5Count += 1;
      else grp.at5Count += 1;
    });

    const groups = Array.from(groupsMap.values());
    groups.forEach(g => {
      g.experts.sort((a, b) => {
        if (a.tier !== b.tier) return a.tier === 'expert_over_5' ? -1 : 1;
        if (b.score !== a.score) return b.score - a.score;
        return a.student.firstName.localeCompare(b.student.firstName, 'fr');
      });
    });

    return groups.sort((a, b) => {
      const domCmp = sortDomains(a.domain, b.domain);
      if (domCmp !== 0) return domCmp;
      const subCmp = a.subDomain.localeCompare(b.subDomain, 'fr', { numeric: true });
      if (subCmp !== 0) return subCmp;
      const codeCmp = a.code.localeCompare(b.code, 'fr', { numeric: true });
      if (codeCmp !== 0) return codeCmp;
      return a.grade.localeCompare(b.grade, 'fr');
    });
  }, [filteredEntries, sortDomains]);

  const stats = useMemo(() => {
    let over5 = 0;
    let at5 = 0;
    const uniqueStudents = new Set<string>();
    filteredEntries.forEach(e => {
      uniqueStudents.add(e.student.id);
      if (e.tier === 'expert_over_5') over5++;
      else at5++;
    });
    return {
      chaptersCount: groupedByChapter.length,
      over5,
      at5,
      studentsCount: uniqueStudents.size
    };
  }, [filteredEntries, groupedByChapter.length]);

  const handleCopyList = () => {
    if (groupedByChapter.length === 0) return;
    const lines = groupedByChapter.map(grp => {
      const expertList = grp.experts
        .map(e => `${e.student.firstName} ${e.student.lastName} (${e.score}/5${e.tier === 'expert_over_5' ? ' ★' : ''})`)
        .join(', ');
      return `${grp.code} (${grp.grade}) — ${grp.title} : ${expertList}`;
    });
    navigator.clipboard?.writeText(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden min-w-0 max-w-full">
      {/* En-tête cliquable avec flèche de repli */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        onClick={() => setIsExpanded(prev => !prev)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsExpanded(prev => !prev);
          }
        }}
        className={cn(
          'px-6 py-4 bg-slate-50 hover:bg-slate-100/80 transition cursor-pointer flex flex-col lg:flex-row lg:items-center justify-between gap-3 select-none',
          isExpanded && 'border-b border-slate-200'
        )}
      >
        <div>
          <h3 className="font-bold text-slate-800 flex items-center gap-2 text-base">
            <Award className="w-5 h-5 text-emerald-700 shrink-0" />
            <span>Liste des Expert(e)s par chapitre</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Repérez immédiatement les élèves ayant validé (5/5) ou dépassé (&gt; 5/5) chaque chapitre, filtrés par domaine, sous-domaine et chapitre.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <span className="text-[11px] font-bold px-2.5 py-1 rounded border bg-emerald-100 text-emerald-800 border-emerald-300 tabular-nums">
            Vert (5/5) : {stats.at5}
          </span>
          <span className="text-[11px] font-bold px-2.5 py-1 rounded border bg-emerald-800 text-white border-emerald-900 tabular-nums">
            Vert foncé (&gt; 5/5) : {stats.over5}
          </span>
          <span className="text-[11px] font-semibold text-slate-600 bg-white border border-slate-200 px-2.5 py-1 rounded tabular-nums">
            {stats.chaptersCount} chapitre{stats.chaptersCount > 1 ? 's' : ''} · {stats.studentsCount} élève{stats.studentsCount > 1 ? 's' : ''}
          </span>
          {isExpanded && (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                handleCopyList();
              }}
              disabled={groupedByChapter.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white hover:bg-slate-100 disabled:opacity-40 text-slate-700 border border-slate-300 transition"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copié' : 'Copier'}
            </button>
          )}
          <span className="p-1 rounded-lg text-slate-500">
            <ChevronDown
              className={cn(
                'w-5 h-5 transition-transform duration-200',
                isExpanded && 'rotate-180'
              )}
            />
          </span>
        </div>
      </div>

      {isExpanded && (
        <>

      {/* Barre de filtres */}
      <div className="p-4 border-b border-slate-200 bg-slate-50/50 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Niveau</label>
            <select
              value={filterGrade}
              onChange={e => {
                setFilterGrade(e.target.value);
                setFilterChapterCode('all');
              }}
              className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-emerald-600 outline-none"
            >
              <option value="all">Tous les niveaux</option>
              {uniqueGrades.map(g => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Domaine</label>
            <select
              value={filterDomain}
              onChange={e => {
                setFilterDomain(e.target.value);
                setFilterSubDomain('all');
                setFilterChapterCode('all');
              }}
              className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-emerald-600 outline-none"
            >
              <option value="all">Tous les domaines</option>
              {uniqueDomains.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Sous-domaine</label>
            <select
              value={filterSubDomain}
              onChange={e => {
                setFilterSubDomain(e.target.value);
                setFilterChapterCode('all');
              }}
              className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-emerald-600 outline-none"
            >
              <option value="all">Tous les sous-domaines</option>
              {uniqueSubDomains.map(sd => (
                <option key={sd} value={sd}>{sd}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Chapitre</label>
            <select
              value={filterChapterCode}
              onChange={e => setFilterChapterCode(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-emerald-600 outline-none"
            >
              <option value="all">Tous les chapitres ({availableChapters.length})</option>
              {availableChapters.map(ch => (
                <option key={ch.code} value={ch.code}>{ch.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Rechercher un élève</label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={studentQuery}
                onChange={e => setStudentQuery(e.target.value)}
                placeholder="Prénom ou nom..."
                className="w-full pl-8 pr-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:ring-2 focus:ring-emerald-600 outline-none"
              />
            </div>
          </div>
        </div>

        {/* Filtre niveau de badge */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-1.5 text-xs">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-600 font-semibold mr-1">Palier affiché :</span>
            <div className="inline-flex items-center bg-slate-200/70 p-0.5 rounded-lg border border-slate-200">
              <button
                type="button"
                onClick={() => setTierFilter('all')}
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs font-semibold transition',
                  tierFilter === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                )}
              >
                Tous (≥ 5)
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
                Vert foncé (&gt; 5)
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
                Vert (5/5)
              </button>
            </div>
          </div>

          {(filterGrade !== 'all' ||
            filterDomain !== 'all' ||
            filterSubDomain !== 'all' ||
            filterChapterCode !== 'all' ||
            tierFilter !== 'all' ||
            studentQuery.trim() !== '') && (
            <button
              type="button"
              onClick={() => {
                setFilterGrade('all');
                setFilterDomain('all');
                setFilterSubDomain('all');
                setFilterChapterCode('all');
                setTierFilter('all');
                setStudentQuery('');
              }}
              className="text-xs font-semibold text-indigo-700 hover:text-indigo-900 underline"
            >
              Réinitialiser les filtres
            </button>
          )}
        </div>
      </div>

      {/* Liste groupée par chapitre */}
      <div className="p-5">
        {groupedByChapter.length === 0 ? (
          <div className="py-10 text-center bg-slate-50 rounded-xl border border-slate-200 space-y-2">
            <Users className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-sm font-semibold text-slate-600">
              Aucun élève expert (≥ 5 réussites) pour cette sélection.
            </p>
            <p className="text-xs text-slate-400">
              Ajustez le domaine, le sous-domaine ou le chapitre ci-dessus pour consulter la liste.
            </p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
            {groupedByChapter.map(grp => (
              <div
                key={grp.key}
                className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-200/80">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mb-0.5">
                      <span className="font-mono font-bold text-slate-800 bg-white border border-slate-200 px-1.5 py-0.5 rounded">
                        {grp.code}
                      </span>
                      <span className="font-semibold text-slate-700">{grp.grade}</span>
                      <span aria-hidden="true">·</span>
                      <span>{grp.domain}</span>
                      <span aria-hidden="true">·</span>
                      <span>{grp.subDomain}</span>
                    </div>
                    <h4 className="text-sm font-bold text-slate-800 leading-snug">
                      {grp.title || grp.code}
                    </h4>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 text-[11px] font-bold tabular-nums">
                    {grp.over5Count > 0 && (
                      <span className="px-2 py-0.5 rounded bg-emerald-800 text-white border border-emerald-900">
                        {grp.over5Count} Expert+
                      </span>
                    )}
                    {grp.at5Count > 0 && (
                      <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300">
                        {grp.at5Count} Expert
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {grp.experts.map(entry => (
                    <div
                      key={`${grp.key}_${entry.student.id}`}
                      className="inline-flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 shadow-2xs"
                    >
                      <span className="text-xs font-bold text-slate-800 whitespace-nowrap">
                        {entry.student.firstName}{' '}
                        <span className="uppercase">{entry.student.lastName}</span>
                      </span>
                      <ExpertBadge score={entry.score} compact />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
        </>
      )}
    </div>
  );
}
