import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { ComposedChart, Line, Bar, XAxis, YAxis, Tooltip, Legend, ReferenceLine, ResponsiveContainer, CartesianGrid } from 'recharts';
import { BookOpen, User } from 'lucide-react';

interface Student { id: string; firstName: string; lastName: string; grade: string; isArchived?: boolean; }
interface Competence { id: number; code: string; domain: string; subDomain?: string; title: string; grade: string; }
interface Result { studentId: string; competenceId: number; score: number; isStarted: boolean; }

export default function ParentPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [competences, setCompetences] = useState<Competence[]>([]);
  const [results, setResults] = useState<Record<string, Record<number, Result>>>({});
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

  const getDomain = useCallback((c: Competence) => c.domain.trim(), []);
  const getGrade = useCallback((c: Competence) => c.grade.trim(), []);

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

  const calculateStudentStock = useCallback((id: string) => {
    let sum = 0;
    Object.values(results[id] || {}).forEach(r => {
      if (r.isStarted && (r.score !== undefined)) {
        sum += r.score;
      }
    });
    return sum;
  }, [results]);

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
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8 font-sans">
      <div className="max-w-4xl mx-auto space-y-6">
         {/* En-tête Élève */}
         <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-2 h-full bg-indigo-500" />
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
               <div>
                 <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 tracking-tight">
                   {student.firstName} {student.lastName}
                 </h1>
                 <p className="text-slate-500 font-medium mt-1">Niveau : {student.grade}</p>
               </div>
               <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 text-center min-w-[140px]">
                 <p className="text-xs font-bold text-indigo-600 uppercase tracking-wide mb-1">Total des réussites</p>
                 <p className="text-3xl font-extrabold text-indigo-700">{calculateStudentStock(student.id)} <span className="text-base font-semibold text-indigo-500">pts</span></p>
               </div>
            </div>
         </div>

         {/* Graphique Bilan */}
         <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8">
            <div className="mb-6">
               <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                 <BookOpen className="w-5 h-5 text-indigo-500" /> Profil d'apprentissage
               </h2>
               <p className="text-sm text-slate-500 mt-1">Comparaison des performances avec la moyenne de la classe sur les domaines travaillés.</p>
            </div>
            
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
                              if (name === 'Élève') return [`${payload.studentRawScore?.toFixed(1) || 0} / 10`, `Moyenne élève`];
                              if (name === 'Moyenne Classe') return [`${payload.cohortRawScore?.toFixed(1) || 0} / 10`, `Moyenne classe`];
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

         {/* Observations */}
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
    </div>
  );
}
