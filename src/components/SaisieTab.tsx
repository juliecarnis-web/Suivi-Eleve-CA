import React, { useState, useMemo } from 'react';
import { Power, UserX, Lock, Unlock, Users, MinusCircle, X, AlertTriangle, CheckSquare, Square } from 'lucide-react';
import { Student, Competence, Result } from '../types';
import { cn, getCode, getGrade, getDomain, getScoreColor, createDomainSorter } from '../utils/helpers';
import SaisieGroupsModal from './SaisieGroupsModal';

interface SaisieTabProps {
  students: Student[];
  competences: Competence[];
  results: Record<string, Record<number, Result>>;
  isEditMode: boolean;
  handleToggleEditMode: () => void;
  toggleArchiveStudent: (id: string, isArchived: boolean) => void;
  startCompetencesForCode: (matchingComps: Competence[], isStarted: boolean) => void;
  setCompetencesToNE: (competenceIds: number[]) => Promise<void> | void;
  upsertResult: (studentId: string, competenceId: number, updates: Partial<Pick<Result, 'score' | 'isStarted'>>) => void;
}

export default function SaisieTab({
  students,
  competences,
  results,
  isEditMode,
  handleToggleEditMode,
  toggleArchiveStudent,
  startCompetencesForCode,
  setCompetencesToNE,
  upsertResult
}: SaisieTabProps) {
  const [filterGrade, setFilterGrade] = useState<string>('all');
  const [filterDomain, setFilterDomain] = useState<string>('all');
  const [filterSubDomain, setFilterSubDomain] = useState<string>('all');
  const [isGroupsModalOpen, setIsGroupsModalOpen] = useState<boolean>(false);
  const [isNeModalOpen, setIsNeModalOpen] = useState<boolean>(false);
  const [selectedNeCodes, setSelectedNeCodes] = useState<Set<string>>(new Set());
  const [isApplyingNe, setIsApplyingNe] = useState<boolean>(false);

  const filteredStudents = useMemo(() => {
    let filtered = students;
    if (filterGrade !== 'all') filtered = filtered.filter(s => s.grade === filterGrade);
    return filtered.sort((a,b) => (a.isArchived === b.isArchived) ? 0 : a.isArchived ? 1 : -1);
  }, [students, filterGrade]);

  const sortDomains = useMemo(() => createDomainSorter(competences), [competences]);

  const { uniqueCompGrades, codes } = useMemo(() => {
    let filtered = competences;
    if (filterGrade !== 'all') filtered = filtered.filter(c => getGrade(c) === filterGrade);
    if (filterDomain !== 'all') filtered = filtered.filter(c => getDomain(c) === filterDomain || c.subDomain === filterDomain);
    if (filterSubDomain !== 'all') filtered = filtered.filter(c => c.subDomain === filterSubDomain);

    const grades = Array.from(new Set(competences.map(c => getGrade(c)).filter(Boolean)));
    const allCodes = Array.from(new Set(filtered.map(c => getCode(c)).filter(Boolean) as string[]))
      .sort((a, b) => {
        const compA = filtered.find(c => getCode(c) === a);
        const compB = filtered.find(c => getCode(c) === b);
        const domA = compA ? getDomain(compA) : '';
        const domB = compB ? getDomain(compB) : '';
        if (domA !== domB) {
           return sortDomains(domA, domB);
        }
        return a.localeCompare(b, undefined, { numeric: true });
      });

    return { uniqueCompGrades: grades, codes: allCodes };
  }, [competences, filterGrade, filterDomain, filterSubDomain, sortDomains]);

  const uniqueGrades = Array.from(new Set(students.map(s => s.grade)));
  const uniqueDomains = Array.from(new Set(competences.map(c => getDomain(c)).filter(Boolean))).sort(sortDomains);
  const uniqueSubCategories = Array.from(new Set(
    competences
      .filter(c => filterDomain === 'all' || getDomain(c) === filterDomain)
      .map(c => c.subDomain)
      .filter(Boolean)
  )).sort((a, b) => (a as string).localeCompare(b as string, undefined, { numeric: true }));
  const scoreOptions = Array.from({length: 11}, (_, i) => i);

  // Analyse des séquences ouvertes (dans les filtres actuels) pour le passage en masse à NE
  const openedSequencesSummary = useMemo(() => {
    const activeSts = students.filter(s => !s.isArchived && (filterGrade === 'all' || s.grade === filterGrade));
    const items: Array<{
      code: string;
      domain: string;
      title: string;
      compIds: number[];
      totalCells: number;
      numericCount: number;
      zeroCount: number;
      positiveCount: number;
      avgScore: number | null;
      isZeroOnly: boolean;
    }> = [];

    codes.forEach(code => {
      const matchingComps = competences.filter(c => getCode(c) === code);
      const isCodeStarted = students.some(s =>
        matchingComps.some(c => Boolean(results[s.id]?.[c.id]?.isStarted))
      );
      if (!isCodeStarted) return;

      let totalCells = 0;
      let numericCount = 0;
      let zeroCount = 0;
      let positiveCount = 0;
      let sumScore = 0;

      activeSts.forEach(s => {
        const comp = matchingComps.find(c => getGrade(c) === s.grade);
        if (!comp) return;
        totalCells++;
        const res = results[s.id]?.[comp.id];
        if (res && res.isStarted && res.score !== null && res.score !== undefined) {
          numericCount++;
          sumScore += res.score;
          if (res.score === 0) zeroCount++;
          else if (res.score > 0) positiveCount++;
        }
      });

      const firstComp = matchingComps[0];
      let cleanTitle = firstComp?.title || code;
      if (cleanTitle.includes(' : ')) {
        cleanTitle = cleanTitle.split(' : ').slice(1).join(' : ');
      }

      items.push({
        code,
        domain: firstComp ? getDomain(firstComp) : '',
        title: cleanTitle,
        compIds: matchingComps.map(c => c.id),
        totalCells,
        numericCount,
        zeroCount,
        positiveCount,
        avgScore: numericCount > 0 ? Math.round((sumScore / numericCount) * 10) / 10 : null,
        isZeroOnly: numericCount > 0 && positiveCount === 0
      });
    });

    return items;
  }, [codes, competences, students, results, filterGrade]);

  const zeroOnlyCount = useMemo(
    () => openedSequencesSummary.filter(item => item.isZeroOnly).length,
    [openedSequencesSummary]
  );

  const openNeModal = () => {
    const preSelected = new Set(
      openedSequencesSummary.filter(item => item.isZeroOnly).map(item => item.code)
    );
    setSelectedNeCodes(preSelected);
    setIsNeModalOpen(true);
  };

  const toggleNeCode = (code: string) => {
    setSelectedNeCodes(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const handleConfirmBulkNe = async () => {
    if (!isEditMode || selectedNeCodes.size === 0) return;
    const compIds = openedSequencesSummary
      .filter(item => selectedNeCodes.has(item.code))
      .flatMap(item => item.compIds);
    if (compIds.length === 0) return;

    setIsApplyingNe(true);
    try {
      await setCompetencesToNE(compIds);
      setIsNeModalOpen(false);
    } finally {
      setIsApplyingNe(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="bg-white border-b border-slate-200 p-3 flex items-center justify-between shrink-0 overflow-x-auto shadow-sm z-40">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-600 whitespace-nowrap">Niveau (Élèves)</label>
            <select value={filterGrade} onChange={e => setFilterGrade(e.target.value)} className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded text-sm font-medium focus:ring-2 focus:ring-indigo-500">
              <option value="all">Tous (Cohorte)</option>
              {uniqueGrades.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div className="w-px h-6 bg-slate-300 mx-2"></div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-600">Domaine</label>
            <select value={filterDomain} onChange={e => {setFilterDomain(e.target.value); setFilterSubDomain('all');}} className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded text-sm font-medium focus:ring-2 focus:ring-indigo-500">
              <option value="all">Tous</option>
              {uniqueDomains.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-600">Sous-domaine</label>
            <select value={filterSubDomain} onChange={e => setFilterSubDomain(e.target.value)} className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded text-sm font-medium focus:ring-2 focus:ring-indigo-500">
                <option value="all">Tous</option>
                {uniqueSubCategories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        
        <div className="flex items-center gap-2 ml-4 shrink-0">
          <button
            type="button"
            onClick={openNeModal}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-semibold bg-slate-100 text-slate-700 border border-slate-300 hover:bg-slate-200 transition-colors"
            title="Basculer des séquences ouvertes en Non Évalué (NE) pour toute la classe"
          >
            <MinusCircle className="w-4 h-4 text-slate-600" />
            <span>Passer à NE</span>
            {zeroOnlyCount > 0 && (
              <span className="px-1.5 py-0.5 text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300 rounded">
                {zeroOnlyCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setIsGroupsModalOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition-colors"
          >
            <Users className="w-4 h-4 text-indigo-600" />
            Binômes / Équipes
          </button>

          <button
            type="button"
            onClick={handleToggleEditMode}
            className={cn("flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-semibold transition-colors border", isEditMode ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100" : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50")}
          >
            {isEditMode ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
            {isEditMode ? 'Mode Saisie: Actif' : 'Activer Saisie'}
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-auto relative">
        <table className="w-max text-left border-separate border-spacing-0">
          <thead className="bg-slate-200 z-40 sticky top-0 shadow-sm">
            <tr>
                <th 
                  colSpan={1 + uniqueCompGrades.length}
                  className="sticky top-0 left-0 z-50 p-0 bg-slate-300 border-none shadow-[2px_0_5px_-2px_rgba(0,0,0,0.15)] align-bottom">
                  <div className="flex h-full items-stretch">
                    <div className="w-[140px] shrink-0 p-2 border-r border-b border-slate-400 flex flex-col justify-end font-bold text-[11px] uppercase text-slate-700 text-left">
                      Code
                    </div>
                    {uniqueCompGrades.map((g, i) => (
                      <div 
                        key={g || i} 
                        className={cn(
                          "w-[220px] shrink-0 bg-slate-200 p-2 border-r border-b border-slate-300 flex flex-col justify-end font-bold text-[10px] uppercase text-slate-600 text-left"
                        )}>
                        Titre {g}
                      </div>
                    ))}
                  </div>
                </th>
                
                {filteredStudents.map(student => (
                  <th key={student.id} className={cn(
                    "p-3 border-r border-b border-slate-300 align-bottom bg-slate-100 min-w-[100px] w-32 relative text-center z-30 sticky top-0",
                    student.isArchived && "opacity-60 bg-slate-200"
                  )}>
                    <div className="flex flex-col items-center justify-end h-full gap-1">
                        <label className={cn("flex items-center mb-1", isEditMode ? "cursor-pointer" : "pointer-events-none opacity-80")} title="Archiver / Réveiller élève">
                          <input type="checkbox" className="sr-only" checked={student.isArchived} onChange={e => toggleArchiveStudent(student.id, e.target.checked)} />
                          <div className={cn("w-6 h-3 rounded-full transition flex items-center px-0.5", student.isArchived ? 'bg-indigo-400' : 'bg-slate-300')}>
                            <div className={cn("bg-white w-2 h-2 rounded-full shadow-sm transform transition", student.isArchived && 'translate-x-3')}></div>
                          </div>
                        </label>
                        {student.isArchived && <UserX className="w-4 h-4 text-slate-400" />}
                        <p className={cn("text-[11px] font-bold uppercase", student.isArchived ? "text-slate-400 line-through" : "text-slate-800")}>{student.lastName}</p>
                        <p className="text-xs font-semibold text-slate-600 truncate max-w-full">{student.firstName}</p>
                        <p className="text-[10px] text-slate-500">{student.grade}</p>
                    </div>
                  </th>
                ))}
            </tr>
          </thead>
          <tbody>
            {codes.map(code => {
              const matchingComps = competences.filter(c => getCode(c) === code);
              let isCodeStarted = false;
              for (const s of students) {
                  for (const c of matchingComps) {
                    if (results[s.id]?.[c.id]?.isStarted) {
                        isCodeStarted = true;
                        break;
                    }
                  }
                  if (isCodeStarted) break;
              }

              const hasNumericScoresForCode = isCodeStarted && students.some(s =>
                matchingComps.some(c => {
                  const sc = results[s.id]?.[c.id]?.score;
                  return sc !== null && sc !== undefined;
                })
              );

              return (
                <tr key={code} className="hover:bg-slate-50 transition border-b border-slate-200 group">
                  <td 
                    colSpan={1 + uniqueCompGrades.length}
                    className="sticky left-0 z-40 p-0 bg-white group-hover:bg-slate-50 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.15)] border-none align-middle"
                  >
                      <div className="flex h-full items-stretch">
                        <div className="w-[140px] shrink-0 p-2 border-r border-b border-slate-200 flex items-center justify-between gap-1 bg-white group-hover:bg-slate-50">
                          <span className="font-bold text-slate-700 text-xs truncate" title={code}>{code}</span>
                          <div className="flex items-center gap-1 shrink-0">
                            {isCodeStarted && isEditMode && (
                              <button
                                type="button"
                                onClick={() => setCompetencesToNE(matchingComps.map(c => c.id))}
                                disabled={!hasNumericScoresForCode}
                                title={hasNumericScoresForCode ? "Passer toute cette séquence à NE (non évalué)" : "Tous les élèves sont déjà en NE"}
                                className={cn(
                                  "px-1.5 py-0.5 text-[10px] font-bold border rounded transition",
                                  hasNumericScoresForCode
                                    ? "bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200"
                                    : "bg-slate-50 text-slate-300 border-slate-200 cursor-default"
                                )}
                              >
                                NE
                              </button>
                            )}
                            <button 
                              onClick={() => startCompetencesForCode(matchingComps, !isCodeStarted)}
                              title={isCodeStarted ? "Fermer cette séquence" : "Activer cette compétence pour tous (en NE par défaut)"}
                              className={cn("p-1.5 border shadow-sm rounded-full transition shrink-0", isCodeStarted ? "bg-indigo-100 text-indigo-700 border-indigo-200 hover:bg-indigo-200" : "bg-white text-slate-400 border-slate-300 hover:text-indigo-500 hover:border-indigo-300", !isEditMode && "pointer-events-none opacity-50")}
                            >
                              <Power className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                        
                        {uniqueCompGrades.map((g, i) => {
                          const compForGrade = matchingComps.find(c => getGrade(c) === g);
                          let displayTitle = '-';
                          if (compForGrade) {
                            displayTitle = compForGrade.title;
                            if (displayTitle.includes(' : ')) {
                                displayTitle = displayTitle.split(' : ').slice(1).join(' : ');
                            }
                          }
                          
                          return (
                            <div 
                              key={g || i} 
                              className="w-[220px] shrink-0 p-2 border-r border-b border-slate-200 flex items-center text-[11px] leading-tight text-slate-600 bg-white group-hover:bg-slate-50"
                              title={compForGrade ? compForGrade.title : ''}
                            >
                              {compForGrade ? displayTitle : <span className="text-slate-300 italic">-</span>}
                            </div>
                          );
                        })}
                      </div>
                  </td>

                  {filteredStudents.map(student => {
                      const comp = matchingComps.find(c => getGrade(c) === student.grade);
                      if (!comp) {
                        return (
                          <td key={student.id} className="p-2 border-r border-b border-slate-200 bg-slate-100/30 align-middle text-center">
                              <span className="text-[10px] text-slate-300 font-medium">Non dispo</span>
                          </td>
                        );
                      }

                      const result = results[student.id]?.[comp.id] || { score: null, isStarted: false };
                      const score = result.score;
                      const isNE = score === null || score === undefined;
                      
                      if (!isCodeStarted) {
                        return (
                          <td key={student.id} className="p-2 border-r border-b border-slate-200 align-middle text-center bg-slate-50 opacity-50">
                              <span className="text-[10px] text-slate-400">-</span>
                          </td>
                        );
                      }

                      return (
                        <td key={student.id} className={cn("p-1.5 border-r border-b border-slate-200 align-middle text-center transition", getScoreColor(score, true), student.isArchived && "opacity-60", !isEditMode && "pointer-events-none")}>
                            <select 
                              value={isNE ? '' : String(score)}
                              onChange={(e) => upsertResult(student.id, comp.id, { score: e.target.value === '' ? null : Number(e.target.value), isStarted: true })}
                              className={cn(
                                "text-sm rounded block w-full p-1 font-bold focus:ring-2 focus:ring-indigo-500 text-center text-center-last appearance-none outline-none",
                                isEditMode ? "bg-white border shadow-sm cursor-pointer" : "bg-transparent border-transparent cursor-default",
                                isNE ? "border-slate-300 text-slate-500 font-semibold" : score >= 5 ? "border-emerald-300 text-emerald-700" : score >= 3 ? "border-amber-300 text-amber-700" : "border-rose-300 text-rose-700"
                              )}
                              disabled={!isEditMode}
                            >
                              <option value="">NE</option>
                              {scoreOptions.map(n => <option key={n} value={n}>{n} / 10</option>)}
                            </select>
                        </td>
                      );
                  })}
                </tr>
              );
            })}
            
            {codes.length === 0 && (
              <tr>
                <td colSpan={1 + uniqueCompGrades.length + filteredStudents.length} className="text-center p-8 text-slate-500 bg-white">
                  Aucune compétence trouvée. Importez la progression.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="bg-white border-t border-slate-300 p-2 flex items-center justify-between shrink-0 shadow-sm z-40">
        <p className="text-[10px] font-bold text-slate-500">
            {codes.length} codes affichés | {filteredStudents.length} élèves
        </p>
      </div>

      <SaisieGroupsModal
        isOpen={isGroupsModalOpen}
        onClose={() => setIsGroupsModalOpen(false)}
        students={students}
        competences={competences}
        results={results}
        initialGrade={filterGrade}
        initialDomain={filterDomain}
        initialSubDomain={filterSubDomain}
      />

      {isNeModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[88vh] border border-slate-200 flex flex-col overflow-hidden">
            <div className="px-6 py-4 bg-slate-800 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-slate-700 flex items-center justify-center border border-slate-600">
                  <MinusCircle className="w-5 h-5 text-slate-200" />
                </div>
                <div>
                  <h3 className="font-bold text-base">Basculer des séquences ouvertes en Non Évalué (NE)</h3>
                  <p className="text-xs text-slate-300">
                    Distingue les séquences réellement évaluées à 0/10 des séquences ouvertes (ex. Période 2) non encore évaluées.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsNeModalOpen(false)}
                className="text-slate-300 hover:text-white transition p-1.5 rounded-lg hover:bg-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto flex-1 space-y-4 bg-slate-50/60">
              {!isEditMode && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-amber-800">
                    <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Le mode Saisie est verrouillé. Activez-le pour appliquer le passage à NE.</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsNeModalOpen(false);
                      handleToggleEditMode();
                    }}
                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold shrink-0 transition"
                  >
                    Activer Saisie
                  </button>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 bg-white border border-slate-200 rounded-xl p-3">
                <div className="text-xs font-semibold text-slate-600">
                  {openedSequencesSummary.length} séquence(s) ouverte(s) dans le filtre actuel •{' '}
                  <span className="text-indigo-700 font-bold">{selectedNeCodes.size} sélectionnée(s)</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedNeCodes(
                        new Set(openedSequencesSummary.filter(i => i.isZeroOnly).map(i => i.code))
                      )
                    }
                    className="text-xs font-semibold px-2.5 py-1 rounded bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 transition"
                  >
                    0 réussite uniquement ({zeroOnlyCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedNeCodes(new Set(openedSequencesSummary.map(i => i.code)))}
                    className="text-xs font-semibold px-2.5 py-1 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition"
                  >
                    Tout cocher
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedNeCodes(new Set())}
                    className="text-xs font-semibold px-2.5 py-1 rounded bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200 transition"
                  >
                    Aucun
                  </button>
                </div>
              </div>

              {openedSequencesSummary.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">
                  Aucune séquence ouverte ne correspond aux filtres actuels.
                </div>
              ) : (
                <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
                  {openedSequencesSummary.map(item => {
                    const isChecked = selectedNeCodes.has(item.code);
                    const hasPositiveScores = item.positiveCount > 0;
                    const isAlreadyAllNE = item.numericCount === 0;

                    return (
                      <label
                        key={item.code}
                        className={cn(
                          "flex items-center justify-between gap-3 p-3 cursor-pointer transition",
                          isChecked ? "bg-indigo-50/40 hover:bg-indigo-50/70" : "hover:bg-slate-50"
                        )}
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={isChecked}
                            onChange={() => toggleNeCode(item.code)}
                          />
                          {isChecked ? (
                            <CheckSquare className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                          )}
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-bold text-xs text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                {item.code}
                              </span>
                              {item.domain && (
                                <span className="text-[11px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                                  {item.domain}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-600 mt-1 truncate" title={item.title}>
                              {item.title}
                            </p>
                          </div>
                        </div>

                        <div className="shrink-0 text-right space-y-1">
                          {isAlreadyAllNE ? (
                            <span className="inline-block text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                              Déjà en NE
                            </span>
                          ) : item.isZeroOnly ? (
                            <span className="inline-block text-[11px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                              {item.zeroCount} élève(s) à 0/10 (0 réussite)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                              {isChecked && <AlertTriangle className="w-3 h-3 text-rose-600" />}
                              {item.positiveCount} note(s) &gt; 0 (moy. {item.avgScore}/10)
                            </span>
                          )}
                          {isChecked && hasPositiveScores && (
                            <p className="text-[10px] font-bold text-rose-600">
                              Effacera les notes saisies !
                            </p>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-white border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
              <p className="text-[11px] text-slate-500">
                La séquence reste ouverte (bouton vert/bleu), mais toutes les cases passent à <strong className="text-slate-700">NE</strong> et sont exclues des moyennes et du rouge.
              </p>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsNeModalOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={handleConfirmBulkNe}
                  disabled={!isEditMode || selectedNeCodes.size === 0 || isApplyingNe}
                  className="px-4 py-2 text-sm font-bold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-lg shadow transition"
                >
                  {isApplyingNe
                    ? 'Application...'
                    : `Passer ${selectedNeCodes.size} séquence(s) à NE`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
