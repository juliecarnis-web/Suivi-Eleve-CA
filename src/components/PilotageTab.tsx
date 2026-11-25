import React, { useState, useMemo, useRef } from 'react';
import { ResponsiveContainer, ComposedChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, Bar, ReferenceLine, Line } from 'recharts';
import { Activity, Layers, BarChart2, User, Award } from 'lucide-react';
import { cn, getCode, getGrade, getDomain, createDomainSorter, scaleScore } from '../utils/helpers';
import { getEvaluatedCompetenceMap } from '../utils/bilanGenerator';
import { Student, Competence, Result, FluenceScore, FluenceReference, CurriculumItem, CurriculumResult, ParentPriorityEntry } from '../types';
import PortailIndividuel from './PortailIndividuel';
import PilotageExpertsPanel from './PilotageExpertsPanel';
import FluenceCharts from './fluence/FluenceCharts';
import CurriculumCharts from './curriculum/CurriculumCharts';

interface PilotageTabProps {
  students: Student[];
  activeStudents: Student[];
  competences: Competence[];
  results: Record<string, Record<number, Result>>;
  fetchObservations: (studentId: string) => Promise<string>;
  saveObservation: (studentId: string, content: string) => Promise<void>;
  uniqueGrades: string[];
  fluenceScores?: FluenceScore[];
  fluenceReferences?: FluenceReference[];
  curriculumItems?: CurriculumItem[];
  curriculumResults?: CurriculumResult[];
  parentPriorities?: ParentPriorityEntry[];
  saveParentPriorities?: (studentId: string, competenceIds: number[]) => Promise<void>;
}

export default function PilotageTab({
  students,
  activeStudents,
  competences,
  results,
  fetchObservations,
  saveObservation,
  uniqueGrades,
  fluenceScores = [],
  fluenceReferences = [],
  curriculumItems = [],
  curriculumResults = [],
  parentPriorities = [],
  saveParentPriorities = async () => {}
}: PilotageTabProps) {
  const [pilotFilterGrade, setPilotFilterGrade] = useState<string>('all');
  const [pilotFilterDomain, setPilotFilterDomain] = useState<string>('all');
  const [pilotFilterSubDomain, setPilotFilterSubDomain] = useState<string>('all');
  const [pilotFluencePeriod, setPilotFluencePeriod] = useState<number>(1);
  
  const [isIndividualMode, setIsIndividualMode] = useState<boolean>(false);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [diagFilterGrade, setDiagFilterGrade] = useState<string>('all');
  const expertsSectionRef = useRef<HTMLDivElement>(null);
  const portailSectionRef = useRef<HTMLDivElement>(null);

  const evaluatedCompMap = useMemo(
    () => getEvaluatedCompetenceMap(activeStudents, competences, results),
    [activeStudents, competences, results]
  );

  const sortDomains = useMemo(() => createDomainSorter(competences), [competences]);

  const pilotUniqueDomains = Array.from(new Set(competences.map(c => getDomain(c)).filter(Boolean))).sort(sortDomains);
  const pilotUniqueSubCategories = Array.from(new Set(
    competences
      .filter(c => pilotFilterDomain === 'all' || getDomain(c) === pilotFilterDomain)
      .map(c => c.subDomain)
      .filter(Boolean)
  )).sort((a, b) => (a as string).localeCompare(b as string, undefined, { numeric: true }));

  const calculateStudentStock = (studentId: string) => {
    let stock = 0;
    const compMap = results[studentId];
    if (compMap) {
      Object.values(compMap).forEach(res => {
         if (res && res.isStarted && res.score !== null && res.score !== undefined) {
            stock += res.score;
         }
      });
    }
    return stock;
  };

  const { pilotageData, activeComps } = useMemo(() => {
    let activeCompsCount = 0;
    const enhancedComps = competences.map(comp => {
      let green = 0, yellow = 0, red = 0, totalStarted = 0, sumScore = 0;
      
      const relevantStudents = activeStudents.filter(s => s.grade === getGrade(comp));
      
      let hasAnyStarted = false;
      relevantStudents.forEach(s => {
        const res = results[s.id]?.[comp.id];
        if (res && res.isStarted) {
          hasAnyStarted = true;
          if (res.score !== null && res.score !== undefined) {
            totalStarted++;
            sumScore += res.score;
            
            if (res.score >= 5) green++;
            else if (res.score >= 3 && res.score < 5) yellow++;
            else red++;
          }
        }
      });
      
      if (hasAnyStarted) activeCompsCount++;
      
      return { 
        ...comp, 
        totalStarted, 
        green, 
        yellow, 
        red, 
        cohortAvg: totalStarted > 0 ? sumScore / totalStarted : null
      };
    });

    let filtered = enhancedComps.filter(c => c.totalStarted > 0 && evaluatedCompMap.has(c.id));
    if (pilotFilterGrade !== 'all') filtered = filtered.filter(c => getGrade(c) === pilotFilterGrade);
    if (pilotFilterDomain !== 'all') filtered = filtered.filter(c => getDomain(c) === pilotFilterDomain || c.subDomain === pilotFilterDomain);
    if (pilotFilterSubDomain !== 'all') filtered = filtered.filter(c => c.subDomain === pilotFilterSubDomain);

    const grouped: Record<string, Record<string, typeof filtered>> = {};
    filtered.forEach(c => {
       const dom = getDomain(c) || 'Sans domaine';
       const sub = c.subDomain || 'Sans sous-domaine';
       if (!grouped[dom]) grouped[dom] = {};
       if (!grouped[dom][sub]) grouped[dom][sub] = [];
       grouped[dom][sub].push(c);
    });

    return { pilotageData: grouped, activeComps: activeCompsCount };
  }, [competences, activeStudents, results, pilotFilterGrade, pilotFilterDomain, pilotFilterSubDomain, evaluatedCompMap]);

  const diagnosticData = useMemo(() => {
    const relevantStudents = activeStudents.filter(s => diagFilterGrade === 'all' || s.grade === diagFilterGrade);
    const studentsWithStock = relevantStudents.map(s => {
       return { ...s, stock: calculateStudentStock(s.id) };
    });

    const avgStock = studentsWithStock.length > 0 
       ? studentsWithStock.reduce((acc, s) => acc + s.stock, 0) / studentsWithStock.length 
       : 0;

    const bottomStudents = [...studentsWithStock]
       .filter(s => s.stock < avgStock)
       .sort((a, b) => a.stock - b.stock)
       .slice(0, 5);

    const topStudents = [...studentsWithStock]
       .filter(s => s.stock >= avgStock)
       .sort((a, b) => b.stock - a.stock)
       .slice(0, 5);

    const relevantComps = competences.filter(c => diagFilterGrade === 'all' || getGrade(c) === diagFilterGrade);
    const compsWithAvg = relevantComps.map(c => {
       const studentsForComp = activeStudents.filter(s => s.grade === getGrade(c));
       let sum = 0;
       let count = 0;
       studentsForComp.forEach(s => {
          const res = results[s.id]?.[c.id];
          if (res && res.isStarted && res.score !== null && res.score !== undefined) {
             sum += res.score;
             count++;
          }
       });
       return { 
         ...c, 
         avg: count > 0 ? sum / count : null,
         count
       };
    }).filter(c => c.count >= 3 && c.avg !== null && c.avg > 0);

    const topComps = [...compsWithAvg].sort((a, b) => (b.avg as number) - (a.avg as number)).slice(0, 3);
    const bottomComps = [...compsWithAvg].sort((a, b) => (a.avg as number) - (b.avg as number)).slice(0, 3);

    return { topStudents, bottomStudents, topComps, bottomComps };
  }, [competences, activeStudents, results, diagFilterGrade]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="bg-white border-b border-slate-200 p-3 flex items-center gap-4 shrink-0 overflow-x-auto shadow-sm z-40">
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-600 whitespace-nowrap">Niveau</label>
          <select value={pilotFilterGrade} onChange={e => setPilotFilterGrade(e.target.value)} className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded text-sm font-medium focus:ring-2 focus:ring-indigo-500">
            <option value="all">Tous (Cohorte)</option>
            {uniqueGrades.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        <div className="w-px h-6 bg-slate-300 mx-2"></div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-600">Domaine</label>
          <select value={pilotFilterDomain} onChange={e => {setPilotFilterDomain(e.target.value); setPilotFilterSubDomain('all');}} className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded text-sm font-medium focus:ring-2 focus:ring-indigo-500">
            <option value="all">Tous</option>
            {pilotUniqueDomains.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-600">Sous-domaine</label>
          <select value={pilotFilterSubDomain} onChange={e => setPilotFilterSubDomain(e.target.value)} className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded text-sm font-medium focus:ring-2 focus:ring-indigo-500">
             <option value="all">Tous</option>
             {pilotUniqueSubCategories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div className="ml-auto flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => expertsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 transition whitespace-nowrap shrink-0"
          >
            <Award className="w-3.5 h-3.5 text-emerald-700" />
            Liste des Expert(e)s
          </button>
          <button
            type="button"
            onClick={() => portailSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition whitespace-nowrap shrink-0"
          >
            <User className="w-3.5 h-3.5 text-indigo-600" />
            Portail Élève &amp; Bilans
          </button>
        </div>
      </div>

      <div className="flex-1 p-6 overflow-auto">
        <div className="w-full space-y-6 min-w-0 max-w-full">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 max-w-full min-w-0">
                <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between min-w-0 max-w-full">
                  <label className="flex items-center gap-3 cursor-pointer shrink-0">
                      <input type="checkbox" checked={isIndividualMode} onChange={e => setIsIndividualMode(e.target.checked)} className="w-5 h-5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500" />
                      <span className="font-semibold text-slate-700">Positionnement individuel</span>
                  </label>
                  
                  {isIndividualMode && (
                      <div className="flex gap-3 items-start md:items-center flex-col md:flex-row flex-1 w-full min-w-0 max-w-full mt-2 md:mt-0">
                        <span className="text-sm font-medium text-slate-600 whitespace-nowrap pt-2 md:pt-0 shrink-0">Élèves :</span>
                        <div className="flex flex-wrap gap-2 flex-1 min-w-0 w-full">
                            {activeStudents.filter(s => pilotFilterGrade === 'all' || s.grade === pilotFilterGrade).map(s => {
                              const isSelected = selectedStudentIds.includes(s.id);
                              return (
                                  <label key={s.id} className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs cursor-pointer whitespace-nowrap transition-colors shrink-0", isSelected ? 'bg-indigo-100 border-indigo-300 text-indigo-800' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50')}>
                                    <input 
                                        type="checkbox" 
                                        className="sr-only"
                                        checked={isSelected}
                                        onChange={(e) => {
                                          if (e.target.checked) setSelectedStudentIds(prev => [...prev, s.id]);
                                          else setSelectedStudentIds(prev => prev.filter(id => id !== s.id));
                                        }}
                                    />
                                    <div className={cn("w-3 h-3 rounded flex items-center justify-center border", isSelected ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-400')}>
                                        {isSelected && <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                                    </div>
                                    {s.firstName} {s.lastName}
                                  </label>
                              );
                            })}
                        </div>
                      </div>
                  )}
                </div>
            </div>

            {(() => {
                let tLightGreen = 0, tMedGreen = 0, tDarkGreen = 0, tGrey = 0;
                
                const filteredStudentsForLifeBar = activeStudents.filter(s => pilotFilterGrade === 'all' || s.grade === pilotFilterGrade);
                const relevantComps = competences.filter(c => pilotFilterGrade === 'all' || getGrade(c) === pilotFilterGrade);

                filteredStudentsForLifeBar.forEach(s => {
                  relevantComps.forEach(c => {
                      const res = results[s.id]?.[c.id];
                      if (res && res.isStarted && res.score !== null && res.score !== undefined && evaluatedCompMap.has(c.id)) {
                        if (res.score >= 5) tDarkGreen++;
                        else if (res.score >= 3 && res.score < 5) tMedGreen++;
                        else tLightGreen++;
                      } else {
                        tGrey++;
                      }
                  });
                });

                const total = tLightGreen + tMedGreen + tDarkGreen + tGrey;
                if (total === 0) return null;

                const pLightGreen = (tLightGreen / total) * 100;
                const pMedGreen = (tMedGreen / total) * 100;
                const pDarkGreen = (tDarkGreen / total) * 100;
                const pGrey = (tGrey / total) * 100;

                return (
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                      <h3 className="font-semibold text-slate-800 mb-4">Progression Annuelle (Vue globale {pilotFilterGrade === 'all' ? 'Cohorte' : pilotFilterGrade})</h3>
                      <div className="flex h-6 rounded-full overflow-hidden shadow-inner w-full bg-slate-100">
                        {pLightGreen > 0 && <div style={{ width: `${pLightGreen}%` }} className="bg-emerald-200 h-full transition-all group relative" title={`Amorcé (< 3): ${tLightGreen} (${pLightGreen.toFixed(1)}%)`}></div>}
                        {pMedGreen > 0 && <div style={{ width: `${pMedGreen}%` }} className="bg-emerald-500 h-full transition-all group relative" title={`En cours (3-4): ${tMedGreen} (${pMedGreen.toFixed(1)}%)`}></div>}
                        {pDarkGreen > 0 && <div style={{ width: `${pDarkGreen}%` }} className="bg-emerald-800 h-full transition-all group relative" title={`Validé (>= 5): ${tDarkGreen} (${pDarkGreen.toFixed(1)}%)`}></div>}
                        {pGrey > 0 && <div style={{ width: `${pGrey}%` }} className="bg-slate-200 h-full transition-all group relative" title={`Non évalué: ${tGrey} (${pGrey.toFixed(1)}%)`}></div>}
                      </div>
                      <div className="flex flex-wrap justify-between items-center gap-3 text-xs font-medium text-slate-600 mt-3 px-1">
                        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-emerald-200 border border-emerald-300"></div> Amorcé &lt; 3 ({pLightGreen.toFixed(1)}%)</div>
                        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-emerald-500"></div> En cours 3–4 ({pMedGreen.toFixed(1)}%)</div>
                        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-emerald-800"></div> Validé ≥ 5 ({pDarkGreen.toFixed(1)}%)</div>
                        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-slate-200 border border-slate-300"></div> Non évalué ({pGrey.toFixed(1)}%)</div>
                      </div>
                  </div>
                );
            })()}

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden min-w-0 max-w-full">
              <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                  <h3 className="font-semibold text-slate-800">Taux de réussite par compétence</h3>
              </div>
              <div className="p-6">
                  {(() => {
                    const chartData: any[] = [];
                    let gapCount = 1;
                    let blockIndex = 0;
                    let domainsToIterate = Object.keys(pilotageData).sort(sortDomains);
                    if (pilotFilterDomain !== 'all') {
                        domainsToIterate = domainsToIterate.filter(d => d === pilotFilterDomain);
                    }
                    
                    domainsToIterate.forEach((domain, domIndex) => {
                        let subDomains = Object.keys(pilotageData[domain] || {}).sort((a,b) => a.localeCompare(b, undefined, { numeric: true }));
                        if (pilotFilterSubDomain !== 'all') {
                          subDomains = subDomains.filter(sd => sd === pilotFilterSubDomain);
                        }

                        subDomains.forEach((subDomain, index) => {
                          const comps = pilotageData[domain][subDomain];
                          comps.sort((a,b) => getCode(a).localeCompare(getCode(b), undefined, { numeric: true }));
                          
                          const currentBlockIndex = blockIndex++;
                          
                          comps.forEach(c => {
                              const codeLabel = pilotFilterGrade === 'all' ? `${getGrade(c)} - ${getCode(c)}` : getCode(c);
                              const dataPoint: any = {
                                name: codeLabel,
                                domain: domain,
                                subDomain: subDomain === 'Sans sous-domaine' ? '' : subDomain,
                                cohortAvg: c.cohortAvg !== null ? Number(c.cohortAvg).toFixed(2) : null,
                              };
                              
                              dataPoint[`cohortAvgScaled_blk_${currentBlockIndex}`] = c.cohortAvg !== null && c.cohortAvg !== undefined ? scaleScore(Number(c.cohortAvg)) : null;

                              if (c.totalStarted > 0) {
                                dataPoint.pctRed = (c.red / c.totalStarted) * 100;
                                dataPoint.pctOrange = (c.yellow / c.totalStarted) * 100;
                                dataPoint.pctGreen = (c.green / c.totalStarted) * 100;
                              } else {
                                dataPoint.pctRed = 0;
                                dataPoint.pctOrange = 0;
                                dataPoint.pctGreen = 0;
                              }

                              dataPoint.zoneRed = 4.8;
                              dataPoint.zoneOrange = 3.2;
                              dataPoint.zoneGreen = 2.0;
                              
                              if (isIndividualMode) {
                                selectedStudentIds.forEach(studentId => {
                                    const s = students.find(st => st.id === studentId);
                                    if (s && s.grade === getGrade(c)) {
                                      const res = results[studentId]?.[c.id];
                                      if (res && res.isStarted && res.score !== null && res.score !== undefined) {
                                          dataPoint[`student_${studentId}`] = res.score;
                                          dataPoint[`student_${studentId}_scaled_blk_${currentBlockIndex}`] = scaleScore(res.score);
                                      }
                                    }
                                });
                              }
                              
                              chartData.push(dataPoint);
                          });
                          
                          const isLastDom = domIndex === domainsToIterate.length - 1;
                          const isLastSub = index === subDomains.length - 1;
                          if (!isLastDom || !isLastSub) {
                              chartData.push({ name: ' '.repeat(gapCount++), isGap: true });
                          }
                        });
                    });
                    
                    const totalBlocks = blockIndex;

                    if (chartData.length === 0) {
                        return <div className="p-6 text-center text-slate-500 italic">Aucune donnée démarrée pour cette sélection.</div>;
                    }

                    const studentColors = ['#9333ea', '#2563eb', '#d97706', '#0891b2', '#c026d3', '#0f766e', '#4f46e5', '#b45309', '#be185d', '#0369a1'];
                    const showCohortAvg = !isIndividualMode || selectedStudentIds.length === 0;

                    return (
                        <div className="h-[300px] w-full min-w-0">
                          <ResponsiveContainer width="100%" height="100%">
                              <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 40 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                <XAxis 
                                    dataKey="name" 
                                    angle={-45} 
                                    textAnchor="end"
                                    height={60}
                                    tick={{ fontSize: 11, fill: '#475569', fontWeight: 'bold' }}
                                    interval={0}
                                />
                                <YAxis 
                                    yAxisId="left"
                                    domain={[0, 10]} 
                                    ticks={[0, 1.6, 3.2, 4.8, 6.4, 8, 8.8, 9.6, 10]}
                                    tickFormatter={(val) => {
                                      if (val <= 8) return String(Math.round(val / 1.6));
                                      return String(Math.round(5 + (val - 8) / 0.4));
                                    }}
                                    tick={{ fontSize: 12, fill: '#475569' }}
                                />
                                <Tooltip 
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    labelStyle={{ fontWeight: 'bold', color: '#1e293b', marginBottom: '4px' }}
                                    formatter={(value: any, name: string, props: any) => {
                                      const payload = props.payload || {};
                                      
                                      if (name === 'Validé (≥ 5)') return [payload.pctGreen !== undefined ? `${Number(payload.pctGreen).toFixed(1)} %` : '0.0 %', name];
                                      if (name === 'En cours (3–4)') return [payload.pctOrange !== undefined ? `${Number(payload.pctOrange).toFixed(1)} %` : '0.0 %', name];
                                      if (name === 'Amorcé (< 3)') return [payload.pctRed !== undefined ? `${Number(payload.pctRed).toFixed(1)} %` : '0.0 %', name];
                                      if (name === 'Moyenne Cohorte') return [payload.cohortAvg !== null && payload.cohortAvg !== undefined ? Number(payload.cohortAvg).toFixed(1) : value, name];
                                      
                                      if (props.dataKey && typeof props.dataKey === 'string' && props.dataKey.includes('_scaled_blk_') && name !== 'Moyenne Cohorte') {
                                          const originalKey = props.dataKey.split('_scaled_blk_')[0];
                                          const originalValue = payload[originalKey];
                                          if (originalValue !== undefined && originalValue !== null) {
                                            const studentId = originalKey.replace('student_', '');
                                            const stock = calculateStudentStock(studentId);
                                            const formatVal = !Number.isInteger(originalValue) ? Number(originalValue).toFixed(1) : originalValue;
                                            return [
                                                <div key={studentId}>
                                                  <span>Note : {formatVal} / 5</span>
                                                  <span className="block text-[10px] font-normal text-slate-500 mt-1">Score global : {stock} réussites</span>
                                                </div>,
                                                name
                                            ];
                                          }
                                          return [null, null];
                                      }
                                      
                                      return [value, name];
                                    }}
                                />
                                <Legend verticalAlign="top" height={36} />
                                
                                <Bar yAxisId="left" dataKey="zoneRed" stackId="a" fill="#d1fae5" opacity={0.85} name="Amorcé (< 3)" barSize={15} />
                                <Bar yAxisId="left" dataKey="zoneOrange" stackId="a" fill="#6ee7b7" opacity={0.65} name="En cours (3–4)" />
                                <Bar yAxisId="left" dataKey="zoneGreen" stackId="a" fill="#10b981" opacity={0.6} name="Validé (≥ 5)" />
                                
                                <ReferenceLine y={8} yAxisId="left" stroke="#047857" strokeWidth={2} label={{ position: 'insideTopLeft', value: 'Objectif Atteint (100%)', fill: '#047857', fontSize: 12, fontWeight: 'bold' }} />
                                
                                {showCohortAvg && Array.from({length: totalBlocks}).map((_, blkIdx) => (
                                    <Line 
                                      key={`cohort-blk-${blkIdx}`}
                                      yAxisId="left"
                                      type="monotone" 
                                      dataKey={`cohortAvgScaled_blk_${blkIdx}`} 
                                      name="Moyenne Cohorte"
                                      legendType={blkIdx === 0 ? "circle" : "none"}
                                      stroke="#2563eb" 
                                      strokeWidth={0}
                                      dot={{ r: 4.5, fill: '#2563eb', strokeWidth: 1.5, stroke: '#fff' }}
                                      activeDot={{ r: 6.5, fill: '#2563eb', strokeWidth: 2, stroke: '#fff' }}
                                      connectNulls={false}
                                    />
                                ))}

                                {isIndividualMode && selectedStudentIds.flatMap((studentId, idx) => {
                                    const s = students.find(st => st.id === studentId);
                                    const labelName = s ? `${s.firstName} ${s.lastName}` : `Élève ${studentId}`;
                                    const color = studentColors[idx % studentColors.length];
                                    return Array.from({length: totalBlocks}).map((_, blkIdx) => (
                                      <Line 
                                          yAxisId="left"
                                          key={`student-${studentId}-blk-${blkIdx}`}
                                          type="monotone" 
                                          dataKey={`student_${studentId}_scaled_blk_${blkIdx}`}
                                          name={labelName}
                                          legendType={blkIdx === 0 ? "circle" : "none"}
                                          stroke={color}
                                          strokeWidth={0}
                                          dot={{ r: 4.5, fill: color, strokeWidth: 1.5, stroke: '#fff' }}
                                          activeDot={{ r: 6.5, fill: color, strokeWidth: 2, stroke: '#fff' }}
                                          connectNulls={false}
                                      />
                                    ));
                                })}
                              </ComposedChart>
                          </ResponsiveContainer>
                        </div>
                    );
                  })()}
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden min-w-0 max-w-full">
                <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                  <h3 className="font-semibold text-slate-800">Diagnostic Stratégique</h3>
                  <div className="flex items-center gap-2">
                      <label className="text-xs font-semibold text-slate-600">Niveau</label>
                      <select value={diagFilterGrade} onChange={e => setDiagFilterGrade(e.target.value)} className="px-2 py-1 bg-white border border-slate-300 rounded text-xs font-medium focus:ring-2 focus:ring-indigo-500">
                        <option value="all">Tous</option>
                        {uniqueGrades.map(g => <option key={g} value={g}>{g}</option>)}
                      </select>
                  </div>
                </div>
                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                      <h4 className="text-sm font-semibold text-rose-700 mb-3 flex items-center justify-between">
                        <span>Alertes (Plus faibles stocks)</span>
                      </h4>
                      <ul className="space-y-2">
                        {diagnosticData.bottomStudents.map(s => (
                            <li key={s.id} className="flex items-center justify-between p-2 rounded bg-rose-50 border border-rose-100 text-sm">
                              <span className="font-medium text-slate-700">{s.firstName} {s.lastName} <span className="text-xs text-slate-500">({s.grade})</span></span>
                              <span className="font-bold text-rose-600">{s.stock} pts</span>
                            </li>
                        ))}
                        {diagnosticData.bottomStudents.length === 0 && <li className="text-xs text-slate-400 italic">Aucune donnée.</li>}
                      </ul>
                  </div>
                  <div>
                      <h4 className="text-sm font-semibold text-emerald-700 mb-3 flex items-center justify-between">
                        <span>Excellence (Meilleurs stocks)</span>
                      </h4>
                      <ul className="space-y-2">
                        {diagnosticData.topStudents.map(s => (
                            <li key={s.id} className="flex items-center justify-between p-2 rounded bg-emerald-50 border border-emerald-100 text-sm">
                              <span className="font-medium text-slate-700">{s.firstName} {s.lastName} <span className="text-xs text-slate-500">({s.grade})</span></span>
                              <span className="font-bold text-emerald-600">{s.stock} pts</span>
                            </li>
                        ))}
                        {diagnosticData.topStudents.length === 0 && <li className="text-xs text-slate-400 italic">Aucune donnée.</li>}
                      </ul>
                  </div>
                  <div>
                      <h4 className="text-sm font-semibold text-amber-700 mb-3 flex items-center justify-between">
                        <span>Notions à besoins (Moy. faibles)</span>
                      </h4>
                      <ul className="space-y-2">
                        {diagnosticData.bottomComps.map(c => (
                            <li key={c.id} className="flex items-center justify-between p-2 rounded bg-amber-50 border border-amber-100 text-sm">
                              <span className="font-medium text-slate-700 truncate mr-2" title={c.title}>{getCode(c)} - {c.title}</span>
                              <span className="font-bold text-amber-600 whitespace-nowrap">{c.avg?.toFixed(1)} / 5</span>
                            </li>
                        ))}
                        {diagnosticData.bottomComps.length === 0 && <li className="text-xs text-slate-400 italic">Aucune donnée.</li>}
                      </ul>
                  </div>
                  <div>
                      <h4 className="text-sm font-semibold text-indigo-700 mb-3 flex items-center justify-between">
                        <span>Notions réussies (Moy. hautes)</span>
                      </h4>
                      <ul className="space-y-2">
                        {diagnosticData.topComps.map(c => (
                            <li key={c.id} className="flex items-center justify-between p-2 rounded bg-indigo-50 border border-indigo-100 text-sm">
                              <span className="font-medium text-slate-700 truncate mr-2" title={c.title}>{getCode(c)} - {c.title}</span>
                              <span className="font-bold text-indigo-600 whitespace-nowrap">{c.avg?.toFixed(1)} / 5</span>
                            </li>
                        ))}
                        {diagnosticData.topComps.length === 0 && <li className="text-xs text-slate-400 italic">Aucune donnée.</li>}
                      </ul>
                  </div>
                </div>
            </div>

            {/* Liste filtrable des Expert(e)s par chapitre */}
            <div ref={expertsSectionRef}>
              <PilotageExpertsPanel
                activeStudents={activeStudents}
                competences={competences}
                results={results}
                uniqueGrades={uniqueGrades}
              />
            </div>

            {/* 1. Vision globale de la classe en Fluence et Curriculum */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden min-w-0 max-w-full">
              <div className="px-6 py-4 border-b border-slate-200 bg-slate-900 text-white flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <BarChart2 className="w-5 h-5 text-indigo-400" />
                  <h3 className="font-bold text-base text-white">Résultats Globaux de la Classe : Fluence & Curriculum</h3>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-300 font-semibold">Période Fluence :</span>
                  <select
                    value={pilotFluencePeriod}
                    onChange={e => setPilotFluencePeriod(Number(e.target.value))}
                    className="px-2.5 py-1 bg-slate-800 border border-slate-700 rounded text-xs text-white font-medium focus:ring-2 focus:ring-indigo-500"
                  >
                    {[1, 2, 3, 4, 5].map(p => (
                      <option key={p} value={p}>Période {p}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="p-6 space-y-8 bg-slate-50/50">
                {/* Visualisation Globale Fluence */}
                <div>
                  <h4 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-indigo-600" />
                    Vue Globale de la Classe en Fluence
                  </h4>
                  <FluenceCharts
                    students={students}
                    fluenceScores={fluenceScores}
                    fluenceReferences={fluenceReferences}
                    selectedPeriod={pilotFluencePeriod}
                    selectedGrade={pilotFilterGrade}
                  />
                </div>

                {/* Visualisation Globale Curriculum */}
                <div className="pt-4 border-t border-slate-200">
                  <h4 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-indigo-600" />
                    Positionnement de la Classe sur le Curriculum
                  </h4>
                  <CurriculumCharts
                    students={students}
                    curriculumItems={curriculumItems}
                    curriculumResults={curriculumResults}
                    selectedGrade={pilotFilterGrade}
                  />
                </div>
              </div>
            </div>

            <div ref={portailSectionRef}>
              <PortailIndividuel
                activeStudents={activeStudents}
                competences={competences}
                results={results}
                fetchObservations={fetchObservations}
                saveObservation={saveObservation}
                calculateStudentStock={calculateStudentStock}
                uniqueGrades={uniqueGrades}
                fluenceScores={fluenceScores}
                fluenceReferences={fluenceReferences}
                curriculumItems={curriculumItems}
                curriculumResults={curriculumResults}
                parentPriorities={parentPriorities}
                saveParentPriorities={saveParentPriorities}
              />
            </div>

            <div className="pt-2">
                <h2 className="text-xl font-bold text-slate-800 tracking-tight mb-4">Analyse de la cohorte</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                      <p className="text-sm font-medium text-slate-500 mb-1">Élèves Actifs</p>
                      <p className="text-2xl font-bold text-indigo-700">{activeStudents.length}</p>
                      <p className="text-xs text-slate-400 mt-1">{students.length - activeStudents.length} archivés</p>
                  </div>
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                      <p className="text-sm font-medium text-slate-500 mb-1">Compétences Démarrées</p>
                      <p className="text-2xl font-bold text-emerald-600">{activeComps}</p>
                      <p className="text-xs text-slate-400 mt-1">Sur {competences.length} au total</p>
                  </div>
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                      <p className="text-sm font-medium text-slate-500 mb-1">Niveaux</p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {uniqueGrades.map(g => (
                          <span key={g} className="px-2 py-1 bg-slate-100 text-slate-700 rounded text-xs font-semibold">{g}</span>
                        ))}
                      </div>
                  </div>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
}
