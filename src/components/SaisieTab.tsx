import React, { useState, useMemo } from 'react';
import { Power, UserX, Lock, Unlock, Users } from 'lucide-react';
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
  upsertResult
}: SaisieTabProps) {
  const [filterGrade, setFilterGrade] = useState<string>('all');
  const [filterDomain, setFilterDomain] = useState<string>('all');
  const [filterSubDomain, setFilterSubDomain] = useState<string>('all');
  const [isGroupsModalOpen, setIsGroupsModalOpen] = useState<boolean>(false);

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
            onClick={() => setIsGroupsModalOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition-colors"
          >
            <Users className="w-4 h-4 text-indigo-600" />
            Binômes / Équipes
          </button>

          <button
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

              return (
                <tr key={code} className="hover:bg-slate-50 transition border-b border-slate-200 group">
                  <td 
                    colSpan={1 + uniqueCompGrades.length}
                    className="sticky left-0 z-40 p-0 bg-white group-hover:bg-slate-50 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.15)] border-none align-middle"
                  >
                      <div className="flex h-full items-stretch">
                        <div className="w-[140px] shrink-0 p-2 border-r border-b border-slate-200 flex items-center justify-between bg-white group-hover:bg-slate-50">
                          <span className="font-bold text-slate-700 text-xs truncate mr-2" title={code}>{code}</span>
                          <button 
                            onClick={() => startCompetencesForCode(matchingComps, !isCodeStarted)}
                            title="Activer cette compétence pour tous"
                            className={cn("p-1.5 border shadow-sm rounded-full transition shrink-0", isCodeStarted ? "bg-indigo-100 text-indigo-700 border-indigo-200 hover:bg-indigo-200" : "bg-white text-slate-400 border-slate-300 hover:text-indigo-500 hover:border-indigo-300", !isEditMode && "pointer-events-none opacity-50")}
                          >
                            <Power className="w-3 h-3" />
                          </button>
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

                      const result = results[student.id]?.[comp.id] || { score: 0, isStarted: false };
                      const score = result.score;
                      
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
                              value={score}
                              onChange={(e) => upsertResult(student.id, comp.id, { score: Number(e.target.value), isStarted: true })}
                              className={cn("text-sm rounded block w-full p-1 font-bold focus:ring-2 focus:ring-indigo-500 text-center text-center-last appearance-none outline-none", isEditMode ? "bg-white border shadow-sm cursor-pointer" : "bg-transparent border-transparent cursor-default", score >= 5 ? "border-emerald-300 text-emerald-700" : score >= 3 ? "border-amber-300 text-amber-700" : "border-rose-300 text-rose-700")}
                              disabled={!isEditMode}
                            >
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
    </div>
  );
}
