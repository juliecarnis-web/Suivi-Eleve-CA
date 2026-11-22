import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { ComposedChart, LineChart, Line, Bar, BarChart, Cell, XAxis, YAxis, Tooltip, Legend, ReferenceLine, ResponsiveContainer, CartesianGrid } from 'recharts';
import { BookOpen, User, CheckCircle, ChevronDown, Printer, Activity, Target, TrendingUp, Book, Layers, Award } from 'lucide-react';
import { Student, Competence, Result, FluenceScore, FluenceReference, CurriculumItem, CurriculumResult } from '../types';

export default function ParentPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [competences, setCompetences] = useState<Competence[]>([]);
  const [results, setResults] = useState<Record<string, Record<number, Result>>>({});
  const [fluenceScores, setFluenceScores] = useState<FluenceScore[]>([]);
  const [fluenceReferences, setFluenceReferences] = useState<FluenceReference[]>([]);
  const [curriculumItems, setCurriculumItems] = useState<CurriculumItem[]>([]);
  const [curriculumResults, setCurriculumResults] = useState<CurriculumResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [studentId, setStudentId] = useState<string>('');
  const [observation, setObservation] = useState('');

  // Extract auth param from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authId = params.get('auth');
    if (authId) setStudentId(authId);
  }, []);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/upsert');
      if (res.ok) {
         const data = await res.json();
         setStudents(data.students || []);
         setCompetences(data.competences || []);
         setResults(data.resultsMap || {});
         setFluenceScores(data.fluenceScores || []);
         setFluenceReferences(data.fluenceReferences || []);
         setCurriculumItems(data.curriculumItems || []);
         setCurriculumResults(data.curriculumResults || []);
      }
    } catch (e) {
      console.error('Erreur chargement données:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (studentId) {
      fetch('/api/upsert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'get_observation', type: 'observation_fetch', studentId }) 
       })
       .then(res => res.json())
       .then(data => setObservation(data.content || data.observation || ''))
       .catch(e => console.error(e));
    }
  }, [studentId]);

  const activeStudents = useMemo(() => students.filter(s => !s.isArchived), [students]);
  const student = useMemo(() => activeStudents.find(s => s.id === studentId), [activeStudents, studentId]);

  const getDomain = useCallback((c: Competence) => (c.domain || '').trim(), []);
  const getGrade = useCallback((c: Competence) => (c.grade || '').trim(), []);

  const portailDomainData = useMemo(() => {
     if (!student) return [];
     const relevantComps = competences.filter(c => getGrade(c) === student.grade);
     const startedComps = relevantComps.filter(c => {
        return activeStudents.some(st => results[st.id]?.[c.id]?.isStarted);
     });

     const domainMap: Record<string, { studentSum: number, studentStartedCount: number, cohortSum: number, cohortStartedCount: number }> = {};
     
     startedComps.forEach(c => {
        const d = getDomain(c) || 'Sans domaine';
        if (!domainMap[d]) domainMap[d] = { studentSum: 0, studentStartedCount: 0, cohortSum: 0, cohortStartedCount: 0 };
        
        const sRes = results[student.id]?.[c.id];
        if (sRes && sRes.isStarted && sRes.score !== undefined) {
           domainMap[d].studentSum += sRes.score;
           domainMap[d].studentStartedCount += 1;
        }
        
        let cohortSumScore = 0;
        let initCount = 0;
        activeStudents.filter(st => st.grade === student.grade).forEach(st => {
           const res = results[st.id]?.[c.id];
           if (res && res.isStarted && res.score !== undefined) {
               cohortSumScore += res.score;
               initCount++;
           }
        });
        
        if (initCount > 0) {
           domainMap[d].cohortSum += (cohortSumScore / initCount);
           domainMap[d].cohortStartedCount += 1;
        }
     });

     return Object.keys(domainMap).sort((a,b) => a.localeCompare(b)).map(d => {
        const info = domainMap[d];
        const studentRawScore = info.studentStartedCount > 0 ? (info.studentSum / info.studentStartedCount) : 0;
        const cohortRawScore = info.cohortStartedCount > 0 ? (info.cohortSum / info.cohortStartedCount) : 0;
        
        return {
           name: d,
           studentRawScore,
           cohortRawScore,
           studentPoints: info.studentSum,
           cohortPoints: info.cohortSum,
        };
     });
  }, [student, activeStudents, competences, results, getGrade, getDomain]);

  const scaleScore = (val: number) => val <= 5 ? (val * 1.6) : (8 + (val - 5) * 0.4);

  const chartPortailData = useMemo(() => {
     return portailDomainData.map((d) => ({
        ...d,
        studentScaled: scaleScore(d.studentRawScore),
        cohortScaled: scaleScore(d.cohortRawScore),
        zoneRed: 4.8,
        zoneOrange: 3.2,
        zoneGreen: 2.0
     }));
  }, [portailDomainData]);

  const progressionData = useMemo(() => {
     if (!student || activeStudents.length === 0) return { target: 0, score: 0, pct: 0 };
     
     const relevantComps = competences.filter(c => getGrade(c) === student.grade);
     const startedComps = relevantComps.filter(c => {
        return activeStudents.some(st => results[st.id]?.[c.id]?.isStarted);
     });

     if (startedComps.length === 0) return { target: 0, score: 0, pct: 0 };

     const target = startedComps.length * 5;
     let score = 0;

     startedComps.forEach(c => {
        const res = results[student.id]?.[c.id];
        if (res && res.isStarted && res.score !== undefined) {
           score += Math.min(res.score, 5); // Plafonné à 5
        }
     });

     const pct = target > 0 ? (score / target) * 100 : 0;

     return { target, score, pct };
  }, [student, activeStudents, competences, results, getGrade]);

  const detailedDomainData = useMemo(() => {
     if (!student || activeStudents.length === 0) return [];
     
     const relevantComps = competences.filter(c => getGrade(c) === student.grade);
     const startedComps = relevantComps.filter(c => {
        return activeStudents.some(st => results[st.id]?.[c.id]?.isStarted);
     });

     const map: Record<string, { target: number, score: number, subDomains: Record<string, { target: number, score: number }> }> = {};

     startedComps.forEach(c => {
        const dom = getDomain(c) || 'Sans domaine';
        const sub = (c.subDomain || '').trim() || 'Sans sous-domaine';

        if (!map[dom]) map[dom] = { target: 0, score: 0, subDomains: {} };
        if (!map[dom].subDomains[sub]) map[dom].subDomains[sub] = { target: 0, score: 0 };

        map[dom].target += 5;
        map[dom].subDomains[sub].target += 5;

        const res = results[student.id]?.[c.id];
        if (res && res.isStarted && res.score !== undefined) {
           const cappedScore = Math.min(res.score, 5);
           map[dom].score += cappedScore;
           map[dom].subDomains[sub].score += cappedScore;
        }
     });

     const domainsList = Object.keys(map).map(dom => {
        const subList = Object.keys(map[dom].subDomains).map(sub => {
           const sData = map[dom].subDomains[sub];
           return {
              name: sub,
              target: sData.target,
              score: sData.score,
              pct: sData.target > 0 ? (sData.score / sData.target) * 100 : 0
           };
        });

        subList.sort((a, b) => a.name.localeCompare(b.name));

        return {
           name: dom,
           target: map[dom].target,
           score: map[dom].score,
           pct: map[dom].target > 0 ? (map[dom].score / map[dom].target) * 100 : 0,
           subDomains: subList,
           subDomainCount: subList.length
        };
     });

     domainsList.sort((a, b) => {
       if (b.subDomainCount !== a.subDomainCount) {
         return b.subDomainCount - a.subDomainCount;
       }
       return a.name.localeCompare(b.name);
     });

     return domainsList;
  }, [student, activeStudents, competences, results, getGrade, getDomain]);

  const [openDomains, setOpenDomains] = useState<Record<string, boolean>>({});

  const toggleDomain = (dom: string) => {
     setOpenDomains(prev => ({ ...prev, [dom]: !prev[dom] }));
  };

  const calculateStudentStock = useCallback((id: string) => {
    let sum = 0;
    Object.values(results[id] || {}).forEach(r => {
      if (r.isStarted && (r.score !== undefined)) {
        sum += r.score;
      }
    });
    return sum;
  }, [results]);

  const studentFluenceData = useMemo(() => {
    if (!student) return { chartData: [], hasData: false, latestEntry: null, yMin: 0, yMax: 100 };

    const studentScores = fluenceScores.filter(s =>
      (s.studentId === student.id || (s as any).studentid === student.id)
    );
    const gradeRefs = fluenceReferences.filter(r => r.grade === student.grade);

    const refScores = fluenceReferences.map(r => Number(r.target_score)).filter(v => !isNaN(v) && v > 0);
    const recordedScores = fluenceScores.map(s => Number(s.score)).filter(v => !isNaN(v) && v > 0);
    const minRef = refScores.length > 0 ? Math.min(...refScores) : 15;
    const maxRef = refScores.length > 0 ? Math.max(...refScores) : 120;
    const maxRecorded = recordedScores.length > 0 ? Math.max(...recordedScores) : 0;
    const yMin = Math.max(0, Math.floor((minRef - 5) / 10) * 10);
    const yMax = Math.ceil((Math.max(maxRef, maxRecorded) + 10) / 10) * 10;

    const periods = [1, 2, 3, 4, 5];
    const chartData = periods.map(p => {
      const scoreObj = studentScores.find(s => Number(s.period) === p);
      const targetRef = gradeRefs.find(r => Number(r.period) === p);
      return {
        period: `Période ${p}`,
        periodNum: p,
        score: scoreObj && scoreObj.score !== undefined && scoreObj.score !== null ? Number(scoreObj.score) : null,
        target: targetRef ? Number(targetRef.target_score) : null,
        errors: scoreObj ? Number(scoreObj.errors_count || 0) : 0,
        textTitle: scoreObj?.text_title || ''
      };
    });

    const validEntries = chartData.filter(d => d.score !== null);
    const latestEntry = validEntries.length > 0 ? validEntries[validEntries.length - 1] : null;

    return {
      chartData,
      hasData: validEntries.length > 0,
      latestEntry,
      yMin,
      yMax
    };
  }, [student, fluenceScores, fluenceReferences]);

  const studentCurriculumData = useMemo(() => {
    if (!student) {
      return {
        items: [],
        results: [],
        chartData: [],
        summary: { totalScore: 0, totalTarget: 0, pct: 0, count3: 0, count2: 0, count1: 0, count0: 0 }
      };
    }

    // 1. Strictly filter curriculum items for the student's grade
    const items = curriculumItems.filter(i => i.grade === student.grade);
    
    // 2. Strictly filter results for ONLY this studentId
    const results = curriculumResults.filter(r => r.studentId === student.id);

    if (items.length === 0) {
      return {
        items: [],
        results,
        chartData: [],
        summary: { totalScore: 0, totalTarget: 0, pct: 0, count3: 0, count2: 0, count1: 0, count0: 0 }
      };
    }

    let totalScore = 0;
    let count3 = 0;
    let count2 = 0;
    let count1 = 0;
    let count0 = 0;

    const allMappedData = items.map(item => {
      const res = results.find(r => r.curriculumId === item.id);
      const score = res && res.score !== undefined && res.score !== null ? Number(res.score) : 0;
      
      totalScore += score;
      if (score === 3) count3++;
      else if (score === 2) count2++;
      else if (score === 1) count1++;
      else count0++;

      return {
        id: item.id,
        code: item.code,
        title: item.title,
        domain: item.domain,
        subDomain: item.subDomain || 'Sans sous-domaine',
        score,
        target: 3
      };
    });

    // Only keep competencies with score >= 1 for the parent chart
    const chartData = allMappedData.filter(d => d.score >= 1);

    const totalTarget = items.length * 3;
    const pct = totalTarget > 0 ? (totalScore / totalTarget) * 100 : 0;

    return {
      items,
      results,
      chartData,
      summary: { totalScore, totalTarget, pct, count3, count2, count1, count0 }
    };
  }, [student, curriculumItems, curriculumResults]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50"><p className="text-slate-500">Chargement...</p></div>;
  }

  if (!studentId || !student) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6">
        <div className="bg-white p-8 rounded-xl shadow-md text-center max-w-md w-full border border-slate-200">
           <User className="w-16 h-16 text-slate-300 mx-auto mb-4" />
           <h1 className="text-xl font-bold text-slate-800 mb-2">Accès restreint</h1>
           <p className="text-slate-500 text-sm">Lien expiré ou élève introuvable. Veuillez vérifier votre URL d'accès.</p>
        </div>
      </div>
    );
  }

  return (
    <div translate="no" className="min-h-screen bg-slate-50 p-2 md:p-6 lg:p-8 font-sans notranslate">
      <div className="max-w-full md:max-w-[98%] mx-auto space-y-6 w-full">
         <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-2 h-full bg-indigo-500" />
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
               <div>
                 <div className="flex items-center gap-3">
                   <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 tracking-tight">
                     {student.firstName} {student.lastName}
                   </h1>
                   <button onClick={() => window.print()} className="no-print p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors flex items-center gap-2 text-sm font-semibold">
                      <Printer className="w-4 h-4" /> <span className="hidden sm:inline">Imprimer le bilan</span>
                   </button>
                 </div>
                 <p className="text-slate-500 font-medium mt-1">Niveau : {student.grade}</p>
               </div>
               <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 text-center min-w-[140px]">
                 <p className="text-xs font-bold text-indigo-600 uppercase tracking-wide mb-1">Total des réussites</p>
                 <p className="text-3xl font-extrabold text-indigo-700">{calculateStudentStock(student.id)} <span className="text-base font-semibold text-indigo-500">pts</span></p>
               </div>
            </div>
         </div>

         <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8">
            <div className="mb-6">
               <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                 <BookOpen className="w-5 h-5 text-indigo-500" /> Profil d'apprentissage
               </h2>
               <p className="text-sm text-slate-500 mt-1">Comparaison des performances avec la moyenne de la classe sur les domaines travaillés.</p>
            </div>
            
            {progressionData.target > 0 && (
               <div className="mb-8 bg-slate-50 p-5 rounded-xl border border-slate-100">
                  <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2 mb-3">
                     <CheckCircle className="w-5 h-5 text-emerald-500" />
                     Progression vers l'objectif de maîtrise
                  </h3>
                  <div className="w-full bg-slate-200 rounded-full h-6 overflow-hidden shadow-inner flex">
                     <div 
                        className="bg-emerald-500 h-full transition-all duration-500 ease-out flex items-center justify-end pr-2"
                        style={{ width: `${Math.min(progressionData.pct, 100)}%` }}
                     >
                        {progressionData.pct >= 5 && <span className="text-xs font-bold text-white drop-shadow-sm">{Math.round(progressionData.pct)}%</span>}
                     </div>
                  </div>
                  <p className="text-xs text-slate-500 mt-2 font-medium text-right">
                     {progressionData.score} / {progressionData.target} briques validées ({progressionData.pct.toFixed(1)}%)
                  </p>
               </div>
            )}

            {chartPortailData.length > 0 ? (
               <div className="h-[300px] w-full min-w-0 mt-4 rounded-xl overflow-hidden border border-slate-100 p-2 sm:p-4 bg-slate-50">
                  <ResponsiveContainer width="100%" height="100%">
                     <ComposedChart data={chartPortailData} margin={{ top: 20, right: 10, left: -20, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis 
                           dataKey="name" 
                           tick={{ fontSize: 11, fill: '#475569', fontWeight: 'bold' }}
                           interval={0}
                           tickMargin={10}
                        />
                        <YAxis 
                           yAxisId="left"
                           domain={[0, 10]} 
                           ticks={[0, 1.6, 3.2, 4.8, 6.4, 8, 8.8, 9.6, 10]}
                           tickFormatter={(val) => {
                              if (val <= 8) return `${Math.round((val / 1.6) * 20)}%`;
                              return `${Math.round((5 + (val - 8) / 0.4) * 20)}%`;
                           }}
                           tick={{ fontSize: 11, fill: '#64748b' }}
                           axisLine={false}
                           tickLine={false}
                        />
                        <Tooltip 
                           contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)' }}
                           labelStyle={{ fontWeight: 'bold', color: '#1e293b', marginBottom: '8px', fontSize: '13px' }}
                           cursor={{fill: '#f1f5f9'}}
                           formatter={(value: any, name: string, props: any) => {
                              const payload = props.payload || {};
                              if (name === 'Élève') return [`${payload.studentRawScore?.toFixed(1) || 0} / 5`, `Moyenne élève`];
                              if (name === 'Moyenne Classe') return [`${payload.cohortRawScore?.toFixed(1) || 0} / 5`, `Moyenne classe`];
                              return [value, name];
                           }}
                        />
                        <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '12px', fontWeight: '500', paddingBottom: '10px' }} />
                        <Bar yAxisId="left" dataKey="zoneRed" stackId="a" fill="#fee2e2" opacity={0.6} name="Non acquis (< 3)" barSize={12} radius={[0,0,4,4]} />
                        <Bar yAxisId="left" dataKey="zoneOrange" stackId="a" fill="#fef3c7" opacity={0.6} name="En cours (3-4)" />
                        <Bar yAxisId="left" dataKey="zoneGreen" stackId="a" fill="#d1fae5" opacity={0.6} name="Validé (>= 5)" radius={[4,4,0,0]} />
                        <ReferenceLine y={8} yAxisId="left" stroke="#10b981" strokeWidth={2} strokeDasharray="3 3" label={{ position: 'insideTopLeft', value: 'Objectif Atteint (100%)', fill: '#10b981', fontSize: 11, fontWeight: 'bold' }} />
                        <Line 
                           yAxisId="left"
                           type="monotone" 
                           dataKey="cohortScaled" 
                           name="Moyenne Classe"
                           stroke="#6366f1" 
                           strokeWidth={2}
                           strokeDasharray="4 4"
                           dot={{ r: 3, fill: '#6366f1', strokeWidth: 1, stroke: '#fff' }}
                        />
                        <Line 
                           yAxisId="left"
                           type="monotone" 
                           dataKey="studentScaled" 
                           name="Élève"
                           stroke="#f43f5e" 
                           strokeWidth={3}
                           dot={{ r: 5, fill: '#f43f5e', strokeWidth: 2, stroke: '#fff' }}
                           activeDot={{ r: 7 }}
                        />
                     </ComposedChart>
                  </ResponsiveContainer>
               </div>
            ) : (
               <div className="h-[250px] flex items-center justify-center text-slate-400 italic bg-slate-50 rounded-xl border border-slate-200 mt-4">
                  Les données de l'élève sont en cours d'acquisition.
               </div>
            )}
         </div>

         {/* BLOC PROFIL & PROGRESSION EN FLUENCE */}
         <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
               <div>
                  <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                     <Activity className="w-5 h-5 text-indigo-600" /> Profil & Progression en Fluence
                  </h2>
                  <p className="text-sm text-slate-500 mt-1">
                     Évolution de la vitesse de lecture mesurée en Mots Correctement Lus par Minute (MCLM) au niveau {student.grade}.
                  </p>
               </div>
               {studentFluenceData.latestEntry && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 flex items-center gap-3 self-start sm:self-auto">
                     <Target className="w-5 h-5 text-emerald-600 shrink-0" />
                     <div>
                        <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-wide">Dernier résultat ({studentFluenceData.latestEntry.period})</p>
                        <p className="text-lg font-extrabold text-emerald-800">
                           {studentFluenceData.latestEntry.score} <span className="text-xs font-semibold text-emerald-600">MCLM</span>
                           {studentFluenceData.latestEntry.target && (
                              <span className="text-xs font-medium text-slate-500 ml-2">
                                 (Objectif {student.grade} : {studentFluenceData.latestEntry.target} MCLM)
                              </span>
                           )}
                        </p>
                     </div>
                  </div>
               )}
            </div>

            {studentFluenceData.hasData ? (
               <div>
                  <div className="h-[280px] w-full min-w-0 mt-2 rounded-xl overflow-hidden border border-slate-100 p-2 sm:p-4 bg-slate-50">
                     <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={studentFluenceData.chartData} margin={{ top: 15, right: 20, left: -10, bottom: 10 }}>
                           <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                           <XAxis dataKey="period" tick={{ fontSize: 12, fill: '#64748B', fontWeight: 'bold' }} />
                           <YAxis
                              domain={[studentFluenceData.yMin, studentFluenceData.yMax]}
                              label={{ value: 'MCLM', angle: -90, position: 'insideLeft', fontSize: 11, fill: '#64748B' }}
                              tick={{ fontSize: 11, fill: '#64748B' }}
                           />
                           <Tooltip
                              contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                              formatter={(value: any, name: string) => [
                                 value !== null ? `${value} MCLM` : 'Non mesuré',
                                 name.includes('Score') ? `Score de ${student.firstName}` : `Seuil d'objectif (${student.grade})`
                              ]}
                           />
                           <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '12px', fontWeight: '500' }} />
                           <Line
                              type="monotone"
                              dataKey="score"
                              name={`Score de ${student.firstName} (MCLM)`}
                              stroke="#4F46E5"
                              strokeWidth={3}
                              dot={{ r: 5, fill: '#4F46E5', strokeWidth: 2, stroke: '#FFFFFF' }}
                              activeDot={{ r: 7 }}
                              connectNulls
                           />
                           <Line
                              type="monotone"
                              dataKey="target"
                              name={`Seuil visé (${student.grade})`}
                              stroke="#10B981"
                              strokeWidth={2}
                              strokeDasharray="5 5"
                              dot={{ r: 4, fill: '#10B981' }}
                           />
                        </LineChart>
                     </ResponsiveContainer>
                  </div>

                  {/* Badges récapitulatifs par période */}
                  <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                     {studentFluenceData.chartData.map(item => (
                        <div key={item.period} className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                           <p className="text-xs font-bold text-slate-500">{item.period}</p>
                           {item.score !== null ? (
                              <div className="mt-1">
                                 <p className="text-base font-extrabold text-indigo-700">{item.score} <span className="text-[10px] font-semibold text-slate-500">MCLM</span></p>
                                 <p className="text-[10px] text-slate-500 font-medium mt-0.5">
                                    {item.errors > 0 ? `${item.errors} erreur(s)` : '0 erreur'}
                                 </p>
                                 {item.textTitle && (
                                    <p className="text-[10px] text-slate-400 italic truncate mt-0.5" title={item.textTitle}>
                                       "{item.textTitle}"
                                    </p>
                                 )}
                              </div>
                           ) : (
                              <p className="text-xs text-slate-400 italic mt-2">—</p>
                           )}
                        </div>
                     ))}
                  </div>
               </div>
            ) : (
               <div className="h-[180px] flex flex-col items-center justify-center text-slate-400 bg-slate-50 rounded-xl border border-slate-200 p-6 text-center">
                  <Activity className="w-8 h-8 text-slate-300 mb-2" />
                  <p className="text-sm font-semibold text-slate-600">Aucune mesure de fluence enregistrée</p>
                  <p className="text-xs text-slate-400 mt-1">Les évaluations de fluence de lecture réalisées au cours de l'année apparaîtront ici.</p>
               </div>
            )}
         </div>

         {/* BLOC PROFIL & PROGRESSION DU CURRICULUM */}
         <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
               <div>
                  <h2 className="text-lg font-bold text-slate-800 flex items-center flex-wrap gap-2">
                     <Layers className="w-5 h-5 text-emerald-700 shrink-0" />
                     <span>Profil & Progression du Curriculum</span>
                     {student && (
                        <span className="text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-md inline-flex items-center gap-1">
                           Élève : {student.firstName} {student.lastName.toUpperCase()} ({student.grade})
                        </span>
                     )}
                  </h2>
                  <p className="text-sm text-slate-500 mt-1">
                     Compétences du curriculum (niveau {student.grade}) enregistrées avec au moins 1 point. Objectif cible : 3 points.
                  </p>
               </div>
               {studentCurriculumData.summary.totalTarget > 0 && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 flex items-center gap-3 self-start sm:self-auto shrink-0">
                     <Award className="w-5 h-5 text-emerald-700 shrink-0" />
                     <div>
                        <p className="text-[11px] font-bold text-emerald-800 uppercase tracking-wide">Score Cumulé Curriculum</p>
                        <p className="text-lg font-extrabold text-emerald-900">
                           {studentCurriculumData.summary.totalScore} <span className="text-xs font-semibold text-emerald-700">/ {studentCurriculumData.summary.totalTarget} pts</span>
                           <span className="text-xs font-bold text-emerald-700 ml-2">({studentCurriculumData.summary.pct.toFixed(1)}%)</span>
                        </p>
                     </div>
                  </div>
               )}
            </div>

            {studentCurriculumData.items.length > 0 ? (
               <div className="space-y-6">
                  {/* Barre de progression globale vers l'objectif 3 points */}
                  <div className="bg-slate-50 p-4 sm:p-5 rounded-xl border border-slate-200">
                     <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                           <CheckCircle className="w-4 h-4 text-emerald-600" />
                           Taux d'acquisition global ({studentCurriculumData.summary.pct.toFixed(1)}%)
                        </span>
                        <span className="text-xs font-semibold text-slate-500">
                           {studentCurriculumData.summary.totalScore} / {studentCurriculumData.summary.totalTarget} points
                        </span>
                     </div>
                     <div className="w-full bg-slate-200 rounded-full h-5 overflow-hidden shadow-inner flex">
                        <div
                           className="bg-emerald-600 h-full transition-all duration-500 ease-out flex items-center justify-end pr-2 text-[10px] font-bold text-white shadow-xs"
                           style={{ width: `${Math.min(studentCurriculumData.summary.pct, 100)}%` }}
                        >
                           {studentCurriculumData.summary.pct >= 8 && `${Math.round(studentCurriculumData.summary.pct)}%`}
                        </div>
                     </div>
                  </div>


                  {/* Graphique à barres par compétence vs Objectif 3 pts */}
                  {studentCurriculumData.chartData.length > 0 ? (
                     <div className="bg-slate-50 rounded-xl border border-slate-200 p-3 sm:p-5">
                        <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
                           Competences acquises ou en cours (au moins 1 point)
                        </h3>
                        <div className="h-[320px] w-full min-w-0">
                           <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={studentCurriculumData.chartData} margin={{ top: 20, right: 15, left: -10, bottom: 50 }}>
                                 <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                 <XAxis
                                    dataKey="code"
                                    tick={{ fontSize: 11, fill: '#475569', fontWeight: 'bold' }}
                                    angle={-35}
                                    textAnchor="end"
                                    interval={0}
                                 />
                                 <YAxis
                                    domain={[0, 3]}
                                    ticks={[0, 1, 2, 3]}
                                    tickFormatter={(val) => `${val} pt${val > 1 ? 's' : ''}`}
                                    tick={{ fontSize: 11, fill: '#64748B' }}
                                 />
                                 <Tooltip
                                    content={({ active, payload }) => {
                                       if (active && payload && payload.length) {
                                          const data = payload[0].payload;
                                          const score = data.score;
                                          let badgeBg = "bg-slate-200 text-slate-700";
                                          let labelStatus = "Non entamé (0 pt)";
                                          if (score === 3) { badgeBg = "bg-emerald-800 text-white"; labelStatus = "Acquis (3 pts)"; }
                                          else if (score === 2) { badgeBg = "bg-emerald-500 text-white"; labelStatus = "En cours (2 pts)"; }
                                          else if (score === 1) { badgeBg = "bg-emerald-200 text-emerald-900"; labelStatus = "Amorcé (1 pt)"; }

                                          return (
                                             <div className="bg-slate-900 text-white text-xs rounded-xl p-3 shadow-xl max-w-xs space-y-1">
                                                <p className="font-bold text-emerald-300">{data.code} — {data.title}</p>
                                                <p className="text-[11px] text-slate-300">{data.domain} {data.subDomain ? `• ${data.subDomain}` : ''}</p>
                                                <div className="pt-1.5 border-t border-slate-700 flex items-center justify-between gap-2">
                                                   <span>Score élève :</span>
                                                   <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${badgeBg}`}>
                                                      {score} / 3 points ({labelStatus})
                                                   </span>
                                                </div>
                                             </div>
                                          );
                                       }
                                       return null;
                                    }}
                                 />
                                 <ReferenceLine
                                    y={3}
                                    stroke="#065F46"
                                    strokeWidth={2}
                                    strokeDasharray="4 4"
                                    label={{ value: 'Objectif Atteint (3 pts)', fill: '#065F46', fontSize: 11, fontWeight: 'bold', position: 'top' }}
                                 />
                                 <Bar dataKey="score" radius={[4, 4, 0, 0]}>
                                    {studentCurriculumData.chartData.map((entry, index) => {
                                       let fillColor = "#A7F3D0"; // 1 pt Vert clair
                                       if (entry.score === 3) fillColor = "#065F46"; // 3 pts Vert foncé
                                       else if (entry.score === 2) fillColor = "#10B981"; // 2 pts Vert moyen
                                       return <Cell key={`cell-${index}`} fill={fillColor} />;
                                    })}
                                 </Bar>
                              </BarChart>
                           </ResponsiveContainer>
                        </div>
                     </div>
                  ) : (
                     <div className="h-[140px] flex flex-col items-center justify-center text-slate-400 bg-slate-50 rounded-xl border border-slate-200 p-6 text-center">
                        <Layers className="w-7 h-7 text-slate-300 mb-2" />
                        <p className="text-sm font-semibold text-slate-600">Aucune compétence entamée (au moins 1 point) pour le moment</p>
                        <p className="text-xs text-slate-400 mt-1">Seules les compétences validées avec au moins 1 point apparaissent dans ce graphique.</p>
                     </div>
                  )}
               </div>
            ) : (
               <div className="h-[180px] flex flex-col items-center justify-center text-slate-400 bg-slate-50 rounded-xl border border-slate-200 p-6 text-center">
                  <Layers className="w-8 h-8 text-slate-300 mb-2" />
                  <p className="text-sm font-semibold text-slate-600">Aucune compétence enregistrée pour ce niveau</p>
                  <p className="text-xs text-slate-400 mt-1">Les compétences du curriculum pour le niveau {student.grade} n'ont pas encore été configurées.</p>
               </div>
            )}
         </div>

         {detailedDomainData.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8">
               <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 mb-6">
                 Détail par Domaines
               </h2>
               <div className="space-y-4">
                  {detailedDomainData.map(dom => (
                     <div key={dom.name} className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                        <button 
                           onClick={() => toggleDomain(dom.name)}
                           className="w-full flex flex-col sm:flex-row sm:items-center justify-between p-4 hover:bg-slate-50 transition text-left focus:outline-none"
                        >
                           <div className="flex items-center gap-2 mb-2 sm:mb-0">
                              <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${openDomains[dom.name] ? 'rotate-180' : ''}`} />
                              <span className="font-bold text-slate-800">{dom.name}</span>
                           </div>
                           <div className="flex flex-col sm:items-end w-full sm:w-1/2">
                              <div className="w-full bg-slate-100 rounded-full h-4 overflow-hidden flex shadow-inner">
                                 <div 
                                    className="bg-emerald-900 h-full transition-all duration-500 ease-out"
                                    style={{ width: `${Math.min(dom.pct, 100)}%` }}
                                 />
                              </div>
                              <span className="text-xs text-slate-500 mt-1 font-medium">
                                 {dom.score} / {dom.target} briques ({dom.pct.toFixed(1)}%)
                              </span>
                           </div>
                        </button>
                        
                        {openDomains[dom.name] && dom.subDomains.length > 0 && (
                           <div className="bg-slate-50 p-4 border-t border-slate-200 space-y-3">
                              {dom.subDomains.map(sub => (
                                 <div key={sub.name} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                    <span className="text-sm font-medium text-slate-700 pl-7">{sub.name}</span>
                                    <div className="flex flex-col sm:items-end w-full sm:w-1/2 pl-7 sm:pl-0">
                                       <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden flex shadow-inner">
                                          <div 
                                             className="bg-emerald-200 h-full transition-all duration-500 ease-out"
                                             style={{ width: `${Math.min(sub.pct, 100)}%` }}
                                          />
                                       </div>
                                       <span className="text-[10px] text-slate-500 mt-1 font-medium">
                                          {sub.score} / {sub.target} briques ({sub.pct.toFixed(1)}%)
                                       </span>
                                    </div>
                                 </div>
                              ))}
                           </div>
                        )}
                     </div>
                  ))}
               </div>
            </div>
         )}

         {observation && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8">
               <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 mb-4">
                 Observations de l'enseignant
               </h2>
               <div className="bg-amber-50/50 border border-amber-100 rounded-xl p-5">
                  <p className="text-slate-700 whitespace-pre-wrap leading-relaxed">{observation}</p>
               </div>
            </div>
         )}
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-break-inside-avoid { break-inside: avoid; }
          body { background: white !important; }
          .shadow-sm, .shadow-md { box-shadow: none !important; border: 1px solid #e2e8f0 !important; }
        }
      `}</style>
    </div>
  );
}
