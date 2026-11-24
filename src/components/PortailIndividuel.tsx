import React, { useState, useMemo, useEffect } from 'react';
import { BookOpen, Activity, Layers, CheckCircle2, TrendingUp, Award, Search, User } from 'lucide-react';
import { ResponsiveContainer, ComposedChart, LineChart, BarChart, Bar, Cell, CartesianGrid, XAxis, YAxis, Tooltip, Legend, ReferenceLine, Line } from 'recharts';
import { Student, Competence, Result, FluenceScore, FluenceReference, CurriculumItem, CurriculumResult, ParentPriorityEntry } from '../types';
import { getGrade, getDomain, scaleScore, createDomainSorter } from '../utils/helpers';
import { getEvaluatedCompetenceMap } from '../utils/bilanGenerator';
import BilanGeneratorPanel from './BilanGeneratorPanel';
import ParentPrioritySelectorPanel from './ParentPrioritySelectorPanel';

interface PortailIndividuelProps {
  activeStudents: Student[];
  competences: Competence[];
  results: Record<string, Record<number, Result>>;
  fetchObservations: (studentId: string) => Promise<string>;
  saveObservation: (studentId: string, content: string) => Promise<void>;
  calculateStudentStock: (studentId: string) => number;
  uniqueGrades: string[];
  fluenceScores?: FluenceScore[];
  fluenceReferences?: FluenceReference[];
  curriculumItems?: CurriculumItem[];
  curriculumResults?: CurriculumResult[];
  parentPriorities?: ParentPriorityEntry[];
  saveParentPriorities?: (studentId: string, competenceIds: number[]) => Promise<void>;
}

export default function PortailIndividuel({
  activeStudents,
  competences,
  results,
  fetchObservations,
  saveObservation,
  calculateStudentStock,
  uniqueGrades,
  fluenceScores = [],
  fluenceReferences = [],
  curriculumItems = [],
  curriculumResults = [],
  parentPriorities = [],
  saveParentPriorities = async () => {}
}: PortailIndividuelProps) {
  const [portailGrade, setPortailGrade] = useState<string>('all');
  const [portailStudentId, setPortailStudentId] = useState<string>('');
  const [portailObservation, setPortailObservation] = useState<string>('');
  const [isSavingObs, setIsSavingObs] = useState(false);
  const [obsFeedback, setObsFeedback] = useState('');
  const [copierFeedback, setCopierFeedback] = useState('');
  const [lienFeedback, setLienFeedback] = useState('');

  // Filtres pour la section Curriculum du portail
  const [currSearchTerm, setCurrSearchTerm] = useState('');
  const [currSubDomainFilter, setCurrSubDomainFilter] = useState('all');

  const sortDomains = useMemo(() => createDomainSorter(competences), [competences]);

  const portailStudents = useMemo(() => {
    if (portailGrade === 'all') return activeStudents;
    return activeStudents.filter(s => s.grade === portailGrade);
  }, [activeStudents, portailGrade]);

  const currentStudent = useMemo(() => {
    return activeStudents.find(s => s.id === portailStudentId);
  }, [activeStudents, portailStudentId]);

  useEffect(() => {
    if (portailStudents.length > 0) {
      if (!portailStudentId || !portailStudents.find(s => s.id === portailStudentId)) {
        setPortailStudentId(portailStudents[0].id);
      }
    } else {
      setPortailStudentId('');
    }
  }, [portailStudents, portailStudentId]);

  useEffect(() => {
    let isMounted = true;
    if (portailStudentId) {
      fetchObservations(portailStudentId).then(content => {
        if (isMounted) setPortailObservation(content);
      });
    } else {
      setPortailObservation('');
    }
    return () => { isMounted = false; };
  }, [portailStudentId, fetchObservations]);

  const evaluatedCompMap = useMemo(
    () => getEvaluatedCompetenceMap(activeStudents, competences, results),
    [activeStudents, competences, results]
  );

  // Données Bilan par domaine (exclut les chapitres ouverts sans saisie effective)
  const portailDomainData = useMemo(() => {
    if (!portailStudentId || !currentStudent) return [];

    const relevantComps = competences.filter(c => getGrade(c) === currentStudent.grade);
    const startedComps = relevantComps.filter(c => evaluatedCompMap.has(c.id));

    const domainMap: Record<string, { studentSum: number, studentStartedCount: number, cohortSum: number, cohortStartedCount: number }> = {};
    
    startedComps.forEach(c => {
      const d = getDomain(c) || 'Sans domaine';
      if (!domainMap[d]) domainMap[d] = { studentSum: 0, studentStartedCount: 0, cohortSum: 0, cohortStartedCount: 0 };
      
      const sRes = results[currentStudent.id]?.[c.id];
      if (sRes && sRes.isStarted && sRes.score !== null && sRes.score !== undefined) {
        domainMap[d].studentSum += sRes.score;
        domainMap[d].studentStartedCount += 1;
      }
      
      let cohortSumScore = 0;
      let initCount = 0;
      activeStudents.filter(st => st.grade === currentStudent.grade).forEach(st => {
        const res = results[st.id]?.[c.id];
        if (res && res.isStarted && res.score !== null && res.score !== undefined) {
          cohortSumScore += res.score;
          initCount++;
        }
      });
      
      if (initCount > 0) {
        domainMap[d].cohortSum += (cohortSumScore / initCount);
        domainMap[d].cohortStartedCount += 1;
      }
    });

    return Object.keys(domainMap).sort(sortDomains).map(d => {
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
  }, [portailStudentId, currentStudent, activeStudents, competences, results, sortDomains, evaluatedCompMap]);

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

  // Données de progression en fluence (P1 à P5)
  const studentFluenceData = useMemo(() => {
    if (!currentStudent) return [];
    const periods = [1, 2, 3, 4, 5];
    return periods.map(p => {
      const scoreObj = fluenceScores.find(
        s => (s.studentId === currentStudent.id || (s as any).studentid === currentStudent.id) && Number(s.period) === Number(p)
      );
      const targetRef = fluenceReferences.find(
        r => r.grade === currentStudent.grade && Number(r.period) === Number(p)
      );
      return {
        period: `P${p}`,
        periodNum: p,
        score: scoreObj && scoreObj.score !== null && scoreObj.score !== undefined ? Number(scoreObj.score) : null,
        target: targetRef ? Number(targetRef.target_score) : null,
        errors: scoreObj ? Number(scoreObj.errors_count || 0) : 0,
        textTitle: scoreObj?.text_title || ''
      };
    });
  }, [currentStudent, fluenceScores, fluenceReferences]);

  // Compétences du curriculum pour le niveau de l'élève
  const studentCurriculumItems = useMemo(() => {
    if (!currentStudent) return [];
    const relevant = curriculumItems.filter(item => item.grade === currentStudent.grade);
    return relevant.length > 0 ? relevant : curriculumItems;
  }, [currentStudent, curriculumItems]);

  // Map des résultats du curriculum pour cet élève
  const studentCurriculumResultsMap = useMemo(() => {
    const map = new Map<number, number>();
    if (!currentStudent) return map;
    curriculumResults.forEach(r => {
      if (r.studentId === currentStudent.id) {
        map.set(r.curriculumId, r.score);
      }
    });
    return map;
  }, [currentStudent, curriculumResults]);

  // Calculs statistiques du curriculum pour cet élève
  const curriculumStats = useMemo(() => {
    if (!studentCurriculumItems || studentCurriculumItems.length === 0) {
      return { totalScore: 0, maxScore: 0, percentage: 0, count0: 0, count1: 0, count2: 0, count3: 0, totalCount: 0 };
    }
    let totalScore = 0;
    let count0 = 0, count1 = 0, count2 = 0, count3 = 0;

    studentCurriculumItems.forEach(item => {
      const score = studentCurriculumResultsMap.get(item.id) ?? 0;
      totalScore += score;
      if (score === 3) count3++;
      else if (score === 2) count2++;
      else if (score === 1) count1++;
      else count0++;
    });

    const maxScore = studentCurriculumItems.length * 3;
    const percentage = maxScore > 0 ? Number(((totalScore / maxScore) * 100).toFixed(1)) : 0;

    return {
      totalScore,
      maxScore,
      percentage,
      count0,
      count1,
      count2,
      count3,
      totalCount: studentCurriculumItems.length
    };
  }, [studentCurriculumItems, studentCurriculumResultsMap]);

  // Filtrage des compétences à afficher dans le portail
  const filteredStudentCurriculumItems = useMemo(() => {
    return studentCurriculumItems.filter(item => {
      if (currSubDomainFilter !== 'all' && (item.subDomain || 'Sans sous-domaine') !== currSubDomainFilter) return false;
      if (currSearchTerm.trim() !== '') {
        const term = currSearchTerm.toLowerCase();
        const matchCode = item.code?.toLowerCase().includes(term);
        const matchTitle = item.title?.toLowerCase().includes(term);
        const matchDomain = item.domain?.toLowerCase().includes(term);
        const matchSub = item.subDomain?.toLowerCase().includes(term);
        if (!matchCode && !matchTitle && !matchDomain && !matchSub) return false;
      }
      return true;
    });
  }, [studentCurriculumItems, currSubDomainFilter, currSearchTerm]);

  // Sous-domaines uniques pour le filtre
  const availableSubDomains = useMemo(() => {
    return Array.from(new Set(studentCurriculumItems.map(i => i.subDomain || 'Sans sous-domaine'))).sort();
  }, [studentCurriculumItems]);

  // Données pour le diagramme en barres du curriculum
  const studentCurriculumChartData = useMemo(() => {
    return filteredStudentCurriculumItems.map(item => {
      const score = studentCurriculumResultsMap.get(item.id) ?? 0;
      return {
        code: item.code,
        title: item.title,
        domain: item.domain,
        subDomain: item.subDomain || 'Sans sous-domaine',
        Score: score,
        Target: 3
      };
    });
  }, [filteredStudentCurriculumItems, studentCurriculumResultsMap]);

  const portailCurrentIndex = portailStudents.findIndex(s => s.id === portailStudentId);
  const goPrevPortail = () => { if (portailCurrentIndex > 0) setPortailStudentId(portailStudents[portailCurrentIndex - 1].id); };
  const goNextPortail = () => { if (portailCurrentIndex >= 0 && portailCurrentIndex < portailStudents.length - 1) setPortailStudentId(portailStudents[portailCurrentIndex + 1].id); };

  // Modification du texte généré par "Copier Bilan"
  const handleCopyBilan = () => {
    const student = activeStudents.find(s => s.id === portailStudentId);
    if (!student) return;

    const lines: string[] = [];
    lines.push(`=== BILAN INDIVIDUEL : ${student.firstName.toUpperCase()} ${student.lastName.toUpperCase()} (${student.grade}) ===`);
    lines.push('');

    // 1. Résultats par domaine (Socle)
    lines.push('--- POSITIONNEMENT PAR DOMAINE ---');
    if (portailDomainData.length > 0) {
      portailDomainData.forEach(d => {
        const realPct = (d.studentRawScore / 5) * 100;
        lines.push(`- ${d.name} : ${realPct.toFixed(1)}% (${d.studentRawScore.toFixed(1)} / 5)`);
      });
    } else {
      lines.push('Aucun résultat par domaine.');
    }
    lines.push('');

    // 2. Résultats en Fluence pour chaque entrée
    lines.push('--- RÉSULTATS EN FLUENCE (MCLM) ---');
    const validFluenceScores = studentFluenceData.filter(d => d.score !== null);
    if (validFluenceScores.length > 0) {
      validFluenceScores.forEach(d => {
        const targetStr = d.target ? ` (Objectif visé: ${d.target} MCLM)` : '';
        const errorStr = d.errors ? `, ${d.errors} erreur(s)` : '';
        lines.push(`- Période ${d.periodNum} : ${d.score} MCLM${targetStr}${errorStr}`);
      });
    } else {
      lines.push('Aucun score de fluence enregistré.');
    }
    lines.push('');

    // 3. Taux de complétion global du Curriculum
    lines.push('--- COMPLÉTION GLOBAL DU CURRICULUM ---');
    lines.push(`- Taux de complétion global : ${curriculumStats.percentage}% (${curriculumStats.totalScore} / ${curriculumStats.maxScore} pts)`);
    lines.push(`- Total compétences : ${curriculumStats.totalCount} (3pts : ${curriculumStats.count3}, 2pts : ${curriculumStats.count2}, 1pt : ${curriculumStats.count1}, 0pt : ${curriculumStats.count0})`);
    lines.push('');

    // 4. Observations
    lines.push('--- OBSERVATIONS & COMMENTAIRES ---');
    lines.push(portailObservation || 'Aucune observation.');

    navigator.clipboard.writeText(lines.join('\n'));
    setCopierFeedback('Copié !');
    setTimeout(() => setCopierFeedback(''), 2000);
  };

  const handleLienParent = () => {
    const url = `${window.location.origin}/parent?auth=${portailStudentId}`;
    navigator.clipboard.writeText(url);
    setLienFeedback('Lien copié !');
    setTimeout(() => setLienFeedback(''), 2000);
  };

  const handleSaveObservation = async () => {
    setIsSavingObs(true);
    setObsFeedback('');
    try {
      await saveObservation(portailStudentId, portailObservation);
      setObsFeedback('✅ Enregistré');
      setTimeout(() => setObsFeedback(''), 2000);
    } catch {
      setObsFeedback('❌ Erreur');
    } finally {
      setIsSavingObs(false);
    }
  };

  return (
    <div className="bg-slate-100 rounded-xl shadow-sm border border-slate-300 overflow-hidden min-w-0 max-w-full my-6">
      {/* En-tête et Sélecteur d'élève */}
      <div className="p-4 border-b border-slate-300 bg-white flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-indigo-600" />
          Portail Individuel Élève
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <select value={portailGrade} onChange={e => setPortailGrade(e.target.value)} className="px-2 py-1.5 border border-slate-300 rounded text-sm bg-white focus:ring-2 focus:ring-indigo-500 font-semibold">
            <option value="all">Tous les niveaux</option>
            {uniqueGrades.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
          
          <div className="flex items-center gap-1">
            <button onClick={goPrevPortail} disabled={portailCurrentIndex <= 0} className="w-8 h-8 flex items-center justify-center rounded border border-slate-300 bg-white disabled:opacity-50 hover:bg-slate-50 transition font-bold text-slate-700">
              &lt;
            </button>
            <select 
              value={portailStudentId} 
              onChange={e => setPortailStudentId(e.target.value)}
              className="px-3 py-1.5 border border-slate-300 rounded text-sm bg-white focus:ring-2 focus:ring-indigo-500 min-w-[200px] font-bold text-slate-800"
            >
              {portailStudents.length === 0 && <option value="">Aucun élève</option>}
              {portailStudents.map(s => (
                <option key={s.id} value={s.id}>{s.lastName.toUpperCase()} {s.firstName} ({s.grade})</option>
              ))}
            </select>
            <button onClick={goNextPortail} disabled={portailCurrentIndex === -1 || portailCurrentIndex >= portailStudents.length - 1} className="w-8 h-8 flex items-center justify-center rounded border border-slate-300 bg-white disabled:opacity-50 hover:bg-slate-50 transition font-bold text-slate-700">
              &gt;
            </button>
          </div>
          
          <div className="flex items-center gap-2 ml-auto">
            <button onClick={handleCopyBilan} disabled={!portailStudentId} className="px-3.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-sm font-bold transition shadow-xs">
              {copierFeedback || 'Copier Bilan'}
            </button>
            <button onClick={handleLienParent} disabled={!portailStudentId} className="px-3.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-sm font-bold transition shadow-xs">
              {lienFeedback || 'Lien Parent'}
            </button>
          </div>
        </div>
      </div>
      
      {/* 1. Bloc Bilan Général + Observations */}
      <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 bg-white min-w-0 border-b border-slate-200">
        <div className="min-w-0">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between mb-4 gap-2">
            <h3 className="font-bold text-slate-800">Graphique Bilan (vs Moy. Classe)</h3>
            {portailStudentId && (
              <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-md border border-indigo-100 whitespace-nowrap self-start xl:self-auto">
                Total réussites : {calculateStudentStock(portailStudentId)} briques cumulées
              </span>
            )}
          </div>
          {portailStudentId && chartPortailData.length > 0 ? (
            <div className="h-[250px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartPortailData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis 
                    dataKey="name" 
                    tick={{ fontSize: 11, fill: '#475569', fontWeight: 'bold' }}
                    interval={0}
                  />
                  <YAxis 
                    yAxisId="left"
                    domain={[0, 10]} 
                    ticks={[0, 1.6, 3.2, 4.8, 6.4, 8, 8.8, 9.6, 10]}
                    tickFormatter={(val) => {
                      if (val <= 8) return `${Math.round((val / 1.6) * 20)}%`;
                      return `${Math.round((5 + (val - 8) / 0.4) * 20)}%`;
                    }}
                    tick={{ fontSize: 12, fill: '#475569' }}
                  />
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    labelStyle={{ fontWeight: 'bold', color: '#1e293b', marginBottom: '4px' }}
                    formatter={(value: any, name: string, props: any) => {
                      const payload = props.payload || {};
                      if (name === 'Élève') return [`${payload.studentRawScore?.toFixed(1) || 0} / 5`, `Moyenne élève`];
                      if (name === 'Moyenne Classe') return [`${payload.cohortRawScore?.toFixed(1) || 0} / 5`, `Moyenne classe`];
                      return [value, name];
                    }}
                  />
                  <Legend verticalAlign="top" height={36} />
                  <Bar yAxisId="left" dataKey="zoneRed" stackId="a" fill="#d1fae5" opacity={0.85} name="Amorcé (< 3)" barSize={15} />
                  <Bar yAxisId="left" dataKey="zoneOrange" stackId="a" fill="#6ee7b7" opacity={0.65} name="En cours (3–4)" />
                  <Bar yAxisId="left" dataKey="zoneGreen" stackId="a" fill="#10b981" opacity={0.6} name="Validé (≥ 5)" />
                  <ReferenceLine y={8} yAxisId="left" stroke="#047857" strokeWidth={2} label={{ position: 'insideTopLeft', value: 'Objectif Atteint (100%)', fill: '#047857', fontSize: 12, fontWeight: 'bold' }} />
                  <Line 
                    yAxisId="left"
                    type="monotone" 
                    dataKey="cohortScaled" 
                    name="Moyenne Classe"
                    legendType="circle"
                    stroke="#2563eb" 
                    strokeWidth={0}
                    dot={{ r: 5, fill: '#2563eb', strokeWidth: 2, stroke: '#fff' }}
                    activeDot={{ r: 7, fill: '#2563eb', strokeWidth: 2, stroke: '#fff' }}
                  />
                  <Line 
                    yAxisId="left"
                    type="monotone" 
                    dataKey="studentScaled" 
                    name="Élève"
                    legendType="circle"
                    stroke="#9333ea" 
                    strokeWidth={0}
                    dot={{ r: 6.5, fill: '#9333ea', strokeWidth: 2, stroke: '#fff' }}
                    activeDot={{ r: 8, fill: '#9333ea', strokeWidth: 2, stroke: '#fff' }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[250px] flex items-center justify-center text-slate-400 italic bg-slate-50 rounded-lg border border-slate-200 text-xs">
              Sélectionnez un élève ou aucune donnée.
            </div>
          )}
        </div>
        
        <div className="flex flex-col h-full min-w-0">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-800">Observations / Bilan</h3>
            {obsFeedback && <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded">{obsFeedback}</span>}
          </div>
          <textarea 
            value={portailObservation}
            onChange={e => setPortailObservation(e.target.value)}
            placeholder="Saisissez les observations pour cet élève..."
            className="flex-1 w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm resize-none min-h-[200px]"
          />
          <div className="mt-3 text-right">
            <button 
              onClick={handleSaveObservation}
              disabled={!portailStudentId || isSavingObs}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold py-2 px-5 rounded-lg shadow-xs transition text-xs"
            >
              {isSavingObs ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </div>

      {/* 1 ter. Sélection pondérée pour le cartouche "Je travaille en priorité..." du Portail Parents */}
      <ParentPrioritySelectorPanel
        currentStudent={currentStudent}
        activeStudents={activeStudents}
        competences={competences}
        results={results}
        evaluatedCompMap={evaluatedCompMap}
        savedPriorities={parentPriorities}
        onSavePriorities={saveParentPriorities}
      />

      {/* 1 bis. Assistant de Bilan Pré-rédigé (Sans IA) */}
      <BilanGeneratorPanel
        currentStudent={currentStudent}
        cohortStudents={portailStudents}
        activeStudents={activeStudents}
        competences={competences}
        results={results}
        fluenceScores={fluenceScores}
        fluenceReferences={fluenceReferences}
        curriculumItems={curriculumItems}
        curriculumResults={curriculumResults}
        selectedGradeLabel={portailGrade}
        onApplyToObservation={async (text) => {
          const trimmed = portailObservation.trim();
          const nextVal = trimmed ? `${trimmed}\n\n${text}` : text;
          setPortailObservation(nextVal);
          if (portailStudentId) {
            try {
              await saveObservation(portailStudentId, nextVal);
              setObsFeedback('✅ Enregistré');
              setTimeout(() => setObsFeedback(''), 2000);
            } catch {
              setObsFeedback('❌ Erreur');
            }
          }
        }}
      />

      {/* 2. Graphique individuel de progression en fluence de l'élève */}
      <div className="p-6 bg-white border-b border-slate-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <h3 className="font-bold text-slate-800 flex items-center gap-2 text-base">
            <Activity className="w-5 h-5 text-indigo-600" />
            Progression Individuelle en Fluence (MCLM)
          </h3>
          {currentStudent && (
            <span className="text-xs font-semibold text-slate-500">
              Élève : <strong className="text-slate-800">{currentStudent.firstName} {currentStudent.lastName}</strong> ({currentStudent.grade})
            </span>
          )}
        </div>

        {currentStudent ? (
          <div className="space-y-4">
            {/* Badges de scores par période */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {studentFluenceData.map((d, idx) => (
                <div key={idx} className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-center">
                  <p className="text-[11px] font-bold text-slate-500 uppercase">{d.period}</p>
                  <p className="text-lg font-extrabold text-indigo-700 mt-0.5">
                    {d.score !== null ? `${d.score} MCLM` : '—'}
                  </p>
                  {d.target && (
                    <p className="text-[10px] font-semibold text-emerald-700 mt-0.5">
                      Obj: {d.target} MCLM
                    </p>
                  )}
                </div>
              ))}
            </div>

            {/* Graphique de progression de la fluence */}
            <div className="h-64 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={studentFluenceData} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis dataKey="period" tick={{ fontSize: 12, fill: '#64748B', fontWeight: 'bold' }} />
                  <YAxis domain={[0, 'auto']} label={{ value: 'MCLM', angle: -90, position: 'insideLeft', fontSize: 11 }} />
                  <Tooltip
                    formatter={(value: any, name: string) => [
                      value !== null ? `${value} MCLM` : 'Non renseigné',
                      name.includes('Score') ? 'Score Élève' : 'Seuil Objectif'
                    ]}
                    contentStyle={{ borderRadius: '8px', border: '1px solid #CBD5E1' }}
                  />
                  <Legend verticalAlign="top" height={36} />
                  <Line
                    type="monotone"
                    dataKey="score"
                    name={`Score (${currentStudent.firstName})`}
                    stroke="#4F46E5"
                    strokeWidth={3}
                    dot={{ r: 5, fill: '#4F46E5' }}
                    activeDot={{ r: 7 }}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="target"
                    name={`Seuil Visé (${currentStudent.grade})`}
                    stroke="#10B981"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={{ r: 4, fill: '#10B981' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-400 italic text-center py-6">Aucun élève sélectionné.</p>
        )}
      </div>

      {/* 3. Résultats de l'élève sur le curriculum (diagramme en barres 0 à 3 points) */}
      <div className="p-6 bg-slate-50/50">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="font-bold text-slate-800 flex items-center flex-wrap gap-2 text-base">
              <Layers className="w-5 h-5 text-indigo-600 shrink-0" />
              <span>Résultats sur le Curriculum (0 à 3 points)</span>
              {currentStudent && (
                <span className="text-xs font-bold text-indigo-800 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-lg inline-flex items-center gap-1.5 shadow-2xs">
                  <User className="w-3.5 h-3.5 text-indigo-600" />
                  Élève : {currentStudent.firstName} {currentStudent.lastName.toUpperCase()} ({currentStudent.grade})
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Score individuel par compétence comparé à l'objectif de validation complète (3 pts).
            </p>
          </div>

          {/* Cartes résumé statistiques : Taux de complétion élève */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="bg-emerald-800 text-white px-3.5 py-2 rounded-xl border border-emerald-900 flex items-center gap-3 shadow-xs">
              <div className="text-right">
                <p className="text-[10px] uppercase font-bold text-emerald-200">Taux de Complétion</p>
                <p className="text-lg font-black leading-tight">{curriculumStats.percentage}%</p>
              </div>
              <div className="h-7 w-px bg-emerald-600"></div>
              <div className="text-xs font-semibold">
                {curriculumStats.totalScore} / {curriculumStats.maxScore} pts
              </div>
            </div>
          </div>
        </div>

        {/* Barre de filtre par sous-domaine & recherche */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 w-full md:w-auto">
            <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">Filtrer par sous-domaine :</span>
            <select
              value={currSubDomainFilter}
              onChange={e => setCurrSubDomainFilter(e.target.value)}
              className="px-2.5 py-1 text-xs border border-slate-300 rounded-lg bg-white font-semibold text-slate-700 w-full md:w-auto"
            >
              <option value="all">Tous les sous-domaines ({availableSubDomains.length})</option>
              {availableSubDomains.map(sd => (
                <option key={sd} value={sd}>{sd}</option>
              ))}
            </select>
          </div>

          <div className="relative w-full md:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Rechercher une compétence..."
              value={currSearchTerm}
              onChange={e => setCurrSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
        </div>

        {/* Diagramme en barres des compétences */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
          {studentCurriculumChartData.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400 italic">
              Aucune compétence disponible pour ce niveau ou ce filtre.
            </div>
          ) : (
            <div className="h-[360px] w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={studentCurriculumChartData} margin={{ top: 20, right: 20, left: 0, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis
                    dataKey="code"
                    tick={{ fontSize: 11, fill: '#475569' }}
                    angle={-35}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis domain={[0, 3]} ticks={[0, 1, 2, 3]} tick={{ fontSize: 11, fill: '#475569' }} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-slate-900 text-white text-xs rounded-lg p-3 shadow-xl max-w-xs space-y-1">
                            <p className="font-bold text-emerald-300">{data.code} — {data.title}</p>
                            <p className="text-[11px] text-slate-300">Sous-domaine : {data.subDomain}</p>
                            <p className="font-bold text-white pt-1">Score : {data.Score} / 3 pts</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <ReferenceLine y={3} stroke="#065F46" strokeDasharray="4 4" label={{ value: 'Objectif (3 pts)', fill: '#065F46', fontSize: 11, position: 'top' }} />
                  <Bar dataKey="Score" radius={[4, 4, 0, 0]}>
                    {studentCurriculumChartData.map((entry, index) => {
                      let fill = '#CBD5E1'; // 0 pt
                      if (entry.Score === 1) fill = '#A7F3D0'; // 1 pt
                      else if (entry.Score === 2) fill = '#10B981'; // 2 pts
                      else if (entry.Score === 3) fill = '#065F46'; // 3 pts
                      return <Cell key={`cell-${index}`} fill={fill} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
